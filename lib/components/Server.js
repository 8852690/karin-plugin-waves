import fs from 'fs/promises';
import waves from "./Code.js";
import express from 'express';
import { logger } from 'node-karin';
import cfg from '../utils/config.js';
import { resPath, basename } from '../utils/dir.js';

class Server {
    constructor() {
        this.app = express();
        this.data = {};
        this.server = null;
        this.init();
    }

    async init() {
        this.app.use(express.json());
        await this.checkServer();

        setInterval(() => {
            this.checkServer();
        }, 5000);

        this.app.get('/login/:id', async (req, res) => {
            const { id } = req.params;
            const filePath = this.data[id] ? '/server/login.html' : '/server/error.html';

            try {
                let data = await fs.readFile(resPath + filePath, 'utf8');
                res.setHeader('Content-Type', 'text/html');
                if (this.data[id]) {
                    data = data.replace(/undefined/g, this.data[id].user_id);
                }
                data = data.replace(/background_image/g, cfg.Config.loginServer.background_api);
                res.send(data);
            } catch (error) {
                logger.error(logger.blue(`[${basename}]`), logger.red(`发送登录页失败：\n${error}}`));
                res.status(500).send('Internal Server Error');
            }
        });

        this.app.post('/code/:id', async (req, res) => {
            const { id } = req.params;
            const { mobile, code } = req.body;

            if (!this.data[id]) { return res.status(200).json({ code: 400, msg: 'Authorization is required' }); }
            if (!mobile || !code) { return res.status(200).json({ code: 400, msg: 'Unable to retrieve mobile number and verification code' }); }

            const data = await waves.getToken(mobile, code);

            if (!data.status) { return res.status(200).json({ code: 400, msg: data.msg }); }
            this.data[id].token = data.data.token;
            return res.status(200).json({ code: 200, msg: 'Login successful' });
        });

        this.app.use((req, res) => {
            res.redirect('https://github.com/erzaozi/waves-plugin');
        });
    }

    async checkServer() {
        const allowLogin = cfg.Config.loginServer.allow_login;

        if (allowLogin && !this.server) {
            const port = cfg.Config.loginServer.server_port;
            this.server = this.app.listen(port, () => {
                logger.info(logger.blue(`[${basename}]`), '在线登录服务端点: ', logger.green(`http://localhost:${port}`));
                logger.info(logger.blue(`[${basename}]`), '外部访问地址: ', logger.green(cfg.Config.loginServer.public_link));
            });
        }

        if (!allowLogin && this.server) {
            this.server.close((error) => {
                if (error) {
                    logger.error(logger.blue(`[${basename}]`), '无法关闭登录服务器', logger.error(error));
                } else {
                    logger.info(logger.blue(`[${basename}]`), '已关闭登录服务器');
                }
            });
            this.server = null;
        }
    }
}

export default new Server();