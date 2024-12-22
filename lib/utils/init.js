import fs from 'fs';
import { join } from 'path';
import { dataPath, basename } from './dir.js';
import { logger, redis, yaml } from 'node-karin';

class Init {
    constructor() {
        // 初始化数据目录.
        this.init();
        this.syncCfg().then((count) => {
            logger.info(logger.blue(`[${basename}]`), '[Sync]', `成功同步 ${count} 个配置文件到 Redis.`);
        });
    }

    init() {
        // 创建目录: 用户数据目录, 抽卡数据目录, 别名数据目录.
        const dir = ['Alias', 'RolePic', 'UserData', 'GachaData'];

        for (const item of dir) {
            const dataDir = join(dataPath, item);
            if (!fs.existsSync(dataDir)) {
                fs.mkdirSync(dataDir);
                logger.info(logger.blue(`[${basename}]`), '[Init]', `创建目录 data/${basename}/${item}.`);
            }
        }
    }

    async syncCfg() {
        const fileList = fs.readdirSync(join(dataPath, 'UserData')).filter(file => file.endsWith('.yaml'));

        const syncPromise = fileList.map(async file => {
            try {
                const data = yaml.read(join(dataPath, 'UserData', file));
                const resKey = `karin:waves:users:${file.replace(/\.yaml$/, '')}`;
                await redis.set(resKey, JSON.stringify(data));
                logger.debug(logger.blue(`[${basename}]`), '[Sync]', `同步 ${file} 到 Redis 成功.`);
            } catch (err) {
                logger.error(logger.blue(`[${basename}]`), '[Sync]', `同步 ${file} 到 Redis 失败.`, err);
                throw err;
            }
        });

        const syncStatus = await Promise.allSettled(syncPromise);
        return syncStatus.filter(({ status }) => status !== 'rejected' ).length;
    }
}

export default new Init();