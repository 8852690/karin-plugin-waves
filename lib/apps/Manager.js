import { join } from 'path';
import fs from 'fs/promises';
import pLimit from 'p-limit';
import cfg from '../utils/config.js';
import waves from '../components/Code.js';
import Render from '../components/render.js';
import { common as cm } from '../utils/common.js';
import { dataPath, basename } from '../utils/dir.js';
import { common, karin, logger, redis } from 'node-karin';


/**
 * 用户管理
 * @param {karin.Event} e
 */
const allUserReg = /^(?:~|～|∽|#?鸣潮)(用户|账号|账户|tk|token)统计$/i;
export const allUser = karin.command(allUserReg, async (e) => {
    e.reply(`正在统计用户, 用户量较大时可能需要一段时间, 请耐心等待...`);

    try {
        // 定义并发数.
        const limit = cfg.Config.public.limit;

        // 定义并发限制, 默认为 limit * 5, 防止 IO 过高.
        const plim = pLimit(limit * 5);

        // 读取所有用户数据.
        const yamlFiles = (await fs.readdir(join(dataPath, 'UserData')))
            .filter(f => f.endsWith('.yaml'));
        const userCounts = await Promise.all(yamlFiles.map(async f =>
            plim(() => common.readYaml(join(dataPath, 'UserData', f)))
        ));

        // 定义请求间隔(5s).
        const interval = 5 * 1000;

        // 分割用户组, 每 limit 个用户一组.
        const userGroups = cm.splitArray(userCounts.flat(), limit);

        // 循环用户组, 每请求一次, 等待一段时间在请求下一组, 防止 QPS 过高.
        const result = [];
        for (const group of userGroups) {
            // 异步请求用户数据.
            const res = await Promise.all(group.map(async user => waves.isAvailable(user.token)));

            // 将结果添加到 result 中.
            result.push(...res);

            // 等待 interval 时间.
            await common.sleep(interval);
        }

        // 计算可用的token数量和过期的token数量.
        const availableCount = result.filter(Boolean).length;
        const expireCount = result.length - availableCount;

        // 当前绑定的用户数量.
        const bindCount = await redis.keys('karin:waves:bind:*');

        // 渲染数据.
        const data = {
            total: result.length,
            bind: bindCount.length,
            login: yamlFiles.length,
            available: availableCount,
            expired: expireCount,
        };

        // 返回渲染结果.
        return e.reply(await Render.render('Template/userManage/userManage', { data }));
    } catch (err) {
        // 记录错误日志, 并返回错误信息.
        logger.error(logger.blue(`[${basename}]`), logger.cyan(`计算总用户数时出现错误`), logger.red(err));
        return e.reply(`[${basename}] 账号总数\n计算总用户数时出现错误, 请检查日志.`) && false;
    }
}, {
    priority: 1009,
    log: true,
    name: '鸣潮-用户统计',
    permission: 'admin',
});

/**
 * 删除失效用户token
 */
const delUserReg = /^(~|～|∽|#?鸣潮)删除失效(用户|账号|账户|tk|token)$/i;
export const delUser = karin.command(delUserReg, async (e) => {
    e.reply(`正在删除失效用户, 用户量较大时可能需要一段时间, 请耐心等待...`);

    try {
        // 定义并发数.
        const limit = cfg.Config.public.limit;

        // 定义并发限制, 默认为 limit.
        const plim = pLimit(limit);

        // 定义变量记录删除的用户数量.
        let delCount = 0;

        // 读取所有用户数据.
        const yamlFiles = (await fs.readdir(join(dataPath, 'UserData')))
            .filter(f => f.endsWith('.yaml'));
        
        await Promise.all(yamlFiles.map(f => {
            plim(async () => {
                // 读取用户数据.
                const users = common.readYaml(join(dataPath, 'UserData', f));

                // 检查用户是否有效.
                const validUsers = await Promise.all(users.map(async user => {
                    // 检查用户是否有效.
                    const valid = await waves.isAvailable(user.token);

                    // 失效用户数量 +1.
                    if (!valid) { delCount++; }

                    // 若用户有效, 则返回用户数据.
                    return valid ? user : null;
                }));

                cfg.setUserData(f.replace('.yaml', ''), validUsers.filter(Boolean));
            });
        }));

        // 返回删除结果.
        return e.reply(`删除失效用户完成, 共删除 ${delCount} 个失效用户.`);
    } catch (err) {
        // 记录错误日志, 并返回错误信息.
        logger.error(logger.blue(`[${basename}]`), logger.cyan(`删除失效用户时出现错误`), logger.red(err));
        return e.reply(`[${basename}] 删除失效用户\n删除失效用户时出现错误, 请检查日志.`) && false;
    }
}, {
    priority: 1009,
    log: true,
    name: '鸣潮-删除失效用户',
    permission: 'admin',
});