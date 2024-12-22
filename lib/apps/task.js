import cfg from '../utils/config.js';
import waves from '../components/Code.js';
import { basename } from '../utils/dir.js';
import Render from '../components/render.js';
import { common as cm } from '../utils/common.js';
import { karin, redis, segment, logger } from 'node-karin';

/**
 * 定时签到任务
 * 可发送 [～全部签到] 手动触发签到任务.
 * cfg.Config.task.signin_time: 签到时间.
 * cfg.taskList.waves_auto_signin_list: 自动签到列表.
 */
const allSignReg = /^(～|~|∽|#?鸣潮)全部(每日)?(游戏|社区)?(签到|任务)$/;
export const signTask = karin.task(`${basename} 定时签到任务`, cfg.Config.task.signin_time, () => signFnc());
export const allSignIn = karin.command(allSignReg, (e) => signFnc(e), {
    priority: 1009,
    log: true,
    name: '鸣潮-自动签到',
    permission: 'master',
});

/**
 * 定时签到方法
 * @param {karin.Event} e 非必要.
 */
let signLock = false;
const signFnc = async (e) => {
    // 如果签到任务正在进行中, 则返回错误信息.
    if (signLock && e) { return e.reply('已有签到任务正在进行中, 请勿重复操作.'); }

    // 锁定签到任务状态, 防止重复操作.
    signLock = true;

    if (e) { e.reply('正在执行签到任务, 稍后将会发送签到结果.'); }

    // 获取需要签到的用户列表.
    const signList = cfg.taskList.waves_auto_signin_list;

    // 如果没有需要签到的用户, 则解锁签到任务状态, 并跳过.
    if (!signList.length) {
        signLock = false;
        logger.info(logger.blue(`[${basename}]`), '[Task-Sign] 当前没有需要签到的用户.');
        return e ? e.reply('当前没有需要签到的用户.') : true;
    }

    // 定义签到间隔时间.
    const interval = cfg.Config.public.signin_interval;

    // 定义签到成功数, 已签到数, 以及签到失败数组, 需要删除的ck数组.
    let successNum = 0;
    const delCK = [];

    // 循环签到列表, 进行签到.
    for (const user of signList) {
        const { botId, groupId, userId } = user;

        // 获取用户的ck.
        const accountList = JSON.parse(await redis.get(`karin:waves:users:${userId}`)) || cfg.getUserData(userId);

        // 如果用户未登录, 则跳过.
        if (!accountList.length) {
            logger.debug(logger.blue(`[${basename}]`), ` [Task-Sign] 用户 [${userId}] 未登录任何账号, 跳过签到.`);
            continue;
        }

        // 循环用户的ck, 进行签到.
        for (const [index, acc] of accountList.entries()) {
            // 检查用户是否已经签到过.
            const resKey = `karin:waves:signIn:${cm.time('YYYY-MM-DD')}:${acc.roleId}`;
            if (await redis.get(resKey)) {
                logger.debug(logger.blue(`[${basename}]`), ` [Task-Sign] 用户 [${userId}] [UID: ${acc.roleId}] 今日已签到过, 跳过.`);
                continue;
            }

            // 检查用户ck是否可用, 不可用则删除, 跳过.
            if (!await waves.isAvailable(acc.token)) {
                logger.debug(logger.blue(`[${basename}]`), ` [Task-Sign] 用户 [${userId}] [UID: ${acc.roleId}] 该账号的ck已失效, 跳过.`);
                delCK.push(acc.roleId);
                continue;
            }

            // 进行游戏签到.
            const gameSign = await waves.gameSignIn(acc.serverId, acc.roleId, acc.userId, acc.token);
            logger.debug(logger.blue(`[${basename}]`), ` [Task-Sign] 用户 [${userId}] [UID: ${acc.roleId}] 游戏签到结果: ${gameSign.status ? '成功' : `失败, 原因: ${gameSign.msg}`}`);

            // 进行社区签到.
            const bbsSign = await waves.bbsSignIn(acc.token, acc.userId);
            logger.debug(logger.blue(`[${basename}]`), ` [Task-Sign] 用户 [${userId}] [UID: ${acc.roleId}] 社区签到结果: ${bbsSign.status ? '成功' : `失败, 原因: ${bbsSign.msg}`}`);

            // 浏览帖子.
            const postData = await waves.getPost();
            const { postId, userId: toUserId } = postData.data.postList.shift();
            const detailCount = await Promise.all(
                Array.from({ length: 3 }, () => waves.detail(postId, acc.token))
            ).then((res) => res.filter((item) => item.status).length);
            logger.debug(logger.blue(`[${basename}]`), ` [Task-Sign] 用户 [${userId}] [UID: ${acc.roleId}] 浏览帖子成功 ${detailCount} 次`);

            // 帖子点赞.
            const likeCount = await Promise.all(
                Array.from({ length: 5 }, () => waves.like(postId, toUserId, acc.token))
            ).then((res) => res.filter((item) => item.status).length);
            logger.debug(logger.blue(`[${basename}]`), ` [Task-Sign] 用户 [${userId}] [UID: ${acc.roleId}] 点赞帖子成功 ${likeCount} 次`);

            // 分享帖子.
            const shareCount = await Promise.all(
                Array.from({ length: 3 }, () => waves.share(acc.token))
            ).then((res) => res.filter((item) => item.status).length);
            logger.debug(logger.blue(`[${basename}]`), ` [Task-Sign] 用户 [${userId}] [UID: ${acc.roleId}] 分享帖子成功 ${shareCount} 次`);

            // 判断签到结果.
            if (gameSign.status
                && bbsSign.status
                && detailCount === 3
                && likeCount === 5
                && shareCount === 3
            ) {
                successNum++;
                await redis.set(resKey, 1, 86400);
            }

            // 如果有多个ck, 则等待一段时间再进行下一个ck的签到.
            if (index < accountList.length - 1) { await cm.sleep(interval * 1000); }
        }

        // 删除失效的ck.
        if (delCK.length) {
            const newAccList = accountList.filter((acc) => !delCK.includes(acc.roleId));
            cfg.setUserData(userId, newAccList);
            logger.debug(logger.blue(`[${basename}]`), ` [Task-Sign] 用户 [${userId}] 删除失效ck: ${delCK.join(', ')}`);

            // 发送ck失效提示.
            const bot = karin.getBot(botId);
            const contact = groupId ? karin.contactGroup(groupId) : karin.contactFriend(userId);

            const msg = [
                groupId ? segment.at(userId) : '',
                `${groupId ? '\n' : ''}您的账号 [${delCK.join(', ')}] 的ck已失效, 签到可能失败, 请使用 [~登录] 进行登录后重试.`,
            ];
            try {
                await bot.SendMessage(contact, msg);
            } catch (err) {
                logger.error(logger.blue(`[${basename}]`), ` [Task-Sign] 发送ck失效提示失败: ${err.message}`);
            }
        }

        logger.debug(logger.blue(`[${basename}]`), ` [Task-Sign] 用户 [${userId}] 签到任务执行完毕, 当前共签到 ${successNum} 个账号.`);

        // 如果有多个用户, 则等待一段时间再进行下一个用户的签到.
        if (user !== signList[signList.length - 1]) { await cm.sleep(interval * 1000); }
    }

    // 解锁签到任务状态.
    signLock = false;
    logger.info(logger.blue(`[${basename}]`), '[Task-Sign] 签到任务执行完毕, 共签到 ', logger.green(`${successNum} 个账号.`));

    // 发送签到结果.
    if (e) { return e.reply(`[${basename}] 签到任务执行完毕, 共签到 ${successNum} 个账号.`); }
    else {
        // TODO: 发送签到结果到管理员, 等止语姐姐给个方法.
    }
};

/**
 * 公告推送
 * cfg.Config.task.news_push_time: 推送时间.
 * cfg.taskList.waves_auto_push_list: 自动推送公告列表.
 */
export const newsPash = karin.task(`${basename} 公告推送任务`, cfg.Config.task.news_push_time, async () => {
    // 获取需要推送的用户列表.
    const pushList = cfg.taskList.waves_auto_push_list;

    // 如果没有需要推送的用户, 则跳过.
    if (!pushList.length) { return logger.info(logger.blue(`[${basename}]`), '[Task-newsPush] 当前没有需要推送的用户.'); }

    // 获取公告内容.
    const newsData = await waves.getEventList();

    // 如果获取公告内容失败, 则返回错误信息.
    if (!newsData.status) { logger.error(logger.blue(`[${basename}]`), ` [Task-newsPush] 获取公告内容失败: ${newsData.msg}`); return false; }

    // 检查是否已推送过.
    const isPushed = (await redis.get('karin:waves:newsPushed')).toString() === newsData.data.list[0].postId.toString();

    // 如果已推送过, 则跳过.
    if (isPushed) { return logger.info(logger.blue(`[${basename}]`), '[Task-newsPush] 未获取到新的公告内容.'); }

    // 定义推送间隔时间(10s).
    const interval = 10 * 1000;

    // 定义推送并发数.
    const limit = cfg.Config.public.limit;

    // 分割推送列表, 每 limit 个用户为一组.
    const pushGroup = cm.splitArray(pushList, limit);

    // 循环推送组, 每推送一组用户, 等待一段时间再推送下一组.
    for (const group of pushGroup) {
        // 异步推送.
        await Promise.all(group.map(async (user) => {
            // 获取用户信息.
            const { botId, groupId, userId } = user;

            // 获取bot实例和联系人实例.
            const bot = karin.getBot(botId);
            const contact = groupId ? karin.contactGroup(groupId) : karin.contactFriend(userId);

            // 发送公告.
            const msg = [
                segment.image(newsData.data.list[0].coverUrl),
                `${newsData.data.list[0].postTitle}\nhttps://www.kurobbs.com/mc/post/${newsData.data.list[0].postId}\n\n${new Date(newsData.data.list[0].publishTime).toLocaleString()}`
            ];

            try {
                await bot.SendMessage(contact, msg);
                logger.debug(logger.blue(`[${basename}]`), ` [Task-newsPush] 用户 [${userId}] 推送公告成功.`);
            } catch (err) {
                logger.error(logger.blue(`[${basename}]`), ` [Task-newsPush] 用户 [${userId}] 推送公告失败: ${err.message}`);
            }
        }));

        if (group !== pushGroup[pushGroup.length - 1]) { await cm.sleep(interval); }
    }

    // 记录已推送的公告.
    await redis.set('karin:waves:newsPushed', newsData.data.list[0].postId);

    return logger.info(logger.blue(`[${basename}]`), '[Task-newsPush] 公告推送任务执行完毕.');
});

/**
 * 体力推送
 * cfg.Config.task.note_push_time: 推送时间.
 * cfg.taskList.waves_auto_push_list: 自动推送体力列表.
 */
export const notePush = karin.task(`${basename} 体力推送任务`, cfg.Config.task.note_push_time, async () => {
    // 获取需要推送的用户列表.
    const pushList = cfg.taskList.waves_auto_push_list;

    // 如果没有需要推送的用户, 则跳过.
    if (!pushList.length) { return logger.info(logger.blue(`[${basename}]`), '[Task-notePush] 当前没有需要推送的用户.'); }

    // 定义推送间隔时间(10s).
    const interval = 10 * 1000;

    // 定义推送并发数.
    const limit = cfg.Config.public.limit;

    // 分割推送列表, 每 limit 个用户为一组.
    const pushGroup = cm.splitArray(pushList, limit);

    // 循环推送组, 每推送一组用户, 等待一段时间再推送下一组.
    for (const group of pushGroup) {
        // 异步推送.
        await Promise.all(group.map(async (user) => {
            // 获取用户信息.
            const { botId, groupId, userId, threshold = 220 } = user;
            const accountList = JSON.parse(await redis.get(`karin:waves:users:${userId}`)) || cfg.getUserData(userId);

            // 如果用户未登录, 则跳过.
            if (!accountList.length) {
                logger.debug(logger.blue(`[${basename}]`), ` [Task-notePush] 用户 [${userId}] 未登录任何账号, 跳过推送.`);
                return false;
            }

            // 获取bot实例和联系人实例.
            const bot = karin.getBot(botId);
            const contact = groupId ? karin.contactGroup(groupId) : karin.contactFriend(userId);

            // 定义存储数据的数组.
            let data = [groupId ? segment.at(userId) : ''];
            const delCK = [];

            // 循环用户的ck, 获取体力信息.
            for (const acc of accountList) {
                // 检查用户ck是否可用, 不可用则删除, 跳过.
                if (!await waves.isAvailable(acc.token)) {
                    logger.debug(logger.blue(`[${basename}]`), ` [Task-notePush] 用户 [${userId}] [UID: ${acc.roleId}] 该账号的ck已失效, 跳过.`);
                    data.push(`[UID: ${acc.roleId}] 该账号的ck已失效, 请使用 [~登录] 进行登录后再尝试使用体力查询.`);
                    delCK.push(acc.roleId);
                    continue;
                }

                // 获取体力信息.
                const res = await waves.getGameData(acc.token);

                // 若获取失败, 则跳过.
                if (!res.status) {
                    data.push(`[UID: ${acc.roleId}] 获取体力值失败: ${res.msg}`);
                    logger.debug(logger.blue(`[${basename}]`), ` [Task-notePush] 用户 [${userId}] [UID: ${acc.roleId}] 获取体力值失败: ${res.msg}`);
                    continue;
                }

                // 判断体力值是否低于阈值.
                const isFull = res.data.energyData.cur >= threshold;

                // 判断是否需要推送.
                const key = `karin:waves:notePushed:${acc.roleId}`;
                const isPushed = await redis.get(key);

                // 如果体力达到阈值, 并且未推送过, 则推送.
                if (isFull && !isPushed) {
                    // 获取推送模板, 定义消息数组.
                    let pushTemplate = cfg.Config.task.note_push_template;
                    let noteMsg = [];

                    // 消息模板替换.
                    pushTemplate = pushTemplate
                        .replace(/{{threshold}}/g, threshold)
                        .replace(/{{roleName}}/g, res.data.roleName);
                    noteMsg.push(segment.text(groupId ? `\n${pushTemplate}` : pushTemplate));

                    // 如果模板中包含 {{noteImg}}, 则发送图文消息.
                    if (/{{noteImg}}/.test(pushTemplate)) {
                        const noteImg = await Render.render('Template/dailyData/dailyData', {
                            avatarUrl: bot.getAvatarUrl(userId),
                            gameData: res.data,
                        });

                        const parts = pushTemplate.split('{{noteImg}}');

                        noteMsg = [
                            segment.text(groupId ? `\n${parts[0] || ''}` : parts[0] || ''),
                            noteImg,
                            segment.text(parts[1] || ''),
                        ];
                    }

                    data = data.concat(noteMsg);
                    await redis.set(key, 1);
                }
                else if (!isFull && isPushed) {
                    await redis.del(key);
                }
            }

            // 删除失效的ck.
            if (delCK.length) {
                const newAccList = accountList.filter((acc) => !delCK.includes(acc.roleId));
                cfg.setUserData(userId, newAccList);
                logger.debug(logger.blue(`[${basename}]`), ` [Task-notePush] 用户 [${userId}] 删除失效ck: ${delCK.join(', ')}`);
            }

            // 推送消息.
            if (data.length > 1) {
                try {
                    await bot.SendMessage(contact, data);
                    logger.debug(logger.blue(`[${basename}]`), ` [Task-notePush] 用户 [${userId}] 推送体力成功.`);
                } catch (err) {
                    logger.error(logger.blue(`[${basename}]`), ` [Task-notePush] 用户 [${userId}] 推送体力失败: ${err.message}`);
                }
            }

            return true;
        }));

        // 如果有多个组, 则等待一段时间再进行下一个用户组的推送.
        if (group !== pushGroup[pushGroup.length - 1]) { await cm.sleep(interval); }
    }

    return logger.info(logger.blue(`[${basename}]`), '[Task-notePush] 体力推送任务执行完毕.');
});