import cfg from '../utils/config.js';
import waves from '../components/Code.js';
import Render from '../components/render.js';
import { common as cm } from '../utils/common.js';
import { common, karin, redis } from 'node-karin';

/**
 * 签到
 * 尝试进行游戏签到与库街区签到
 * @param {karin.Event} e
 */
const signReg = /^(～|~|∽|#?鸣潮)(游戏|社区)?签到$/;
export const signIn = karin.command(signReg, async (e) => {
    // 获取用户的ck.
    const accountList = JSON.parse(await redis.get(`karin:waves:users:${e.user_id}`)) || cfg.getUserData(e.user_id);

    // 如果用户未登录, 则返回错误信息.
    if (!accountList.length) { return e.reply('当前没有登录任何账号, 请使用 [~登录] 进行登录后再进行签到.'); }

    // 定义几个数组, 用来存数据.
    const data = [];
    const delCK = [];

    // 循环用户的ck, 进行签到.
    for (const [index, acc] of accountList.entries()) {
        // 检查用户是否已经签到过.
        const resKey = `karin:waves:signIn:${cm.time('YYYY-MM-DD')}:${acc.roleId}`;
        if (await redis.get(resKey)) {
            data.push(`[UID: ${acc.roleId}] 今日已签到过, 请明日再来.`);
            continue;
        }

        // 检查用户ck是否可用, 不可用则删除, 并返回错误信息.
        if (!await waves.isAvailable(acc.token)) {
            data.push(`[UID: ${acc.roleId}] 该账号的ck已失效, 请使用 [~登录] 进行登录后重试.`);
            delCK.push(acc.roleId);
            continue;
        }

        // 定义签到结果文本.
        let msg = `[UID: ${acc.roleId}] 签到结果: \n\n======= 游戏签到 =======\n`;

        // 尝试进行游戏签到.
        const gameSign = await waves.gameSignIn(acc.serverId, acc.roleId, acc.userId, acc.token);

        msg += gameSign.status
            ? '签到成功, 可使用 [~签到记录] 查看近期签到记录\n\n'
            : `签到失败, 原因: ${gameSign.msg}\n\n`;

        msg += '======= 社区签到 =======\n';

        // 获取帖子列表并进行社区签到, 若获取失败, 则跳过社区签到.
        const postData = await waves.getPost();
        if (!postData.status) {
            msg += '库街区帖子列表获取失败, 无法继续社区签到任务.';
            data.push(msg);
            continue;
        }

        // 社区签到.
        const bbsSign = await waves.bbsSignIn(acc.token, acc.userId);
        msg += bbsSign.status ? '[用户签到] 签到成功' : `[用户签到] 签到失败, 原因: ${bbsSign.msg}`;

        // 获取帖子id及作者id
        const { postId, userId: toUserId } = postData.data.postList.shift();

        // 浏览帖子.
        const detailResult = await Promise.all(Array.from({ length: 3 }, () => waves.detail(postId, acc.token)));
        const detailCount = detailResult.filter(res => res.status).length;
        msg += `\n[浏览帖子] 浏览帖子成功 ${detailCount} 次`;

        // 帖子点赞.
        const sendLikeResult = await Promise.all(Array.from({ length: 5 }, () => waves.like(postId, toUserId, acc.token)));
        const likeCount = sendLikeResult.filter(res => res.status).length;
        msg += `\n[帖子点赞] 帖子点赞成功 ${likeCount} 次`;

        // 分享帖子.
        const shareResult = await waves.share(acc.token);
        msg += shareResult.status ? '\n[分享帖子] 分享帖子成功' : `\n[分享帖子] 分享帖子失败, 原因: ${shareResult.msg}`;

        // 记录已签到, 防止用户多次执行引发风控.
        if (gameSign.status && bbsSign.status && detailCount === 3 && likeCount === 5 && shareResult.status) {
            await redis.set(resKey, 1, { EX: 86400 });
        }

        // 写入签到结果.
        data.push(msg);

        // 如果有多个账号, 则暂停一会, 防止快速请求引发风控.
        if (index < accountList.length - 1) { await cm.sleep(cfg.Config.public.signin_interval * 1000); }
    }

    // 删除失效ck.
    if (delCK.length) {
        const newAccList = accountList.filter(acc => !delCK.includes(acc.roleId));
        cfg.setUserData(e.user_id, newAccList);
    }

    // 制作消息.
    const msg = data.length === 1
        ? data[0]
        : common.makeForward(
            [`[用户: ${e.user_id}] 签到结果: `, ...data],
            e.bot.account.uin,
            e.bot.account.name,
        );
    
    // 返回签到结果.
    return data.length === 1
        ? e.reply(msg, { reply: true })
        : e.bot.sendForwardMessage(e.contact, msg);
}, {
    priority: 1009,
    log: true,
    name: '鸣潮-签到',
    permission: 'all'
});

/**
 * 游戏签到记录
 * 获取用户的游戏签到记录.
 * @param {karin.Event} e
 */
const signRecordReg = /^(～|~|∽|#?鸣潮)(游戏)?签到记录$/;
export const signRecord = karin.command(signRecordReg, async (e) => {
    // 获取用户的ck.
    const accountList = JSON.parse(await redis.get(`karin:waves:users:${e.user_id}`)) || cfg.getUserData(e.user_id);

    // 如果用户未登录, 则返回错误信息.
    if (!accountList.length) { return e.reply('当前没有登录任何账号, 请使用 [~登录] 进行登录后再查询签到记录.'); }

    // 定义消息数组.
    const data = [];
    const delCK = [];

    // 循环用户的ck, 获取签到记录.
    for (const acc of accountList) {
        // 检查用户ck是否可用, 不可用则删除, 并返回错误信息.
        if (!await waves.isAvailable(acc.token)) {
            data.push(`[UID: ${acc.roleId}] 该账号的ck已失效, 请使用 [~登录] 进行登录后重试.`);
            delCK.push(acc.roleId);
            continue;
        }

        // 尝试获取签到记录.
        const signRecord = await waves.queryRecord(acc.serverId, acc.roleId, acc.token);

        // 检查签到记录是否获取成功.
        if (!signRecord.status) { data.push(`[UID: ${acc.roleId}] 签到记录获取失败, 原因: ${signRecord.msg}`); }
        else {
            // 渲染签到记录.
            const img = await Render.render('Template/queryRecord/queryRecord', {
                listData: signRecord.data.slice(0, 30),
            });

            data.push(img);
        }
    }

    // 删除失效ck.
    if (delCK.length) {
        const newAccList = accountList.filter(acc => !delCK.includes(acc.roleId));
        cfg.setUserData(e.user_id, newAccList);
    }

    // 制作消息.
    const msg = data.length === 1
        ? data[0]
        : common.makeForward(
            [`[用户: ${e.user_id}] 签到记录: `, ...data],
            e.bot.account.uin,
            e.bot.account.name,
        );

    // 返回签到记录.
    return data.length === 1
        ? e.reply(msg, { reply: true })
        : e.bot.sendForwardMessage(e.contact, msg);
}, {
    priority: 1009,
    log: true,
    name: '鸣潮-游戏签到记录',
    permission: 'all'
});

/**
 * 社区任务列表
 * 获取用户当天的社区任务列表.
 * @param {karin.Event} e
 */
const bbsTaskListReg = /^(～|~|∽|#?鸣潮)(社区|每日)?任务列表$/;
export const bbsTaskList = karin.command(bbsTaskListReg, async (e) => {
    // 获取用户的ck.
    const accountList = JSON.parse(await redis.get(`karin:waves:users:${e.user_id}`)) || cfg.getUserData(e.user_id);

    // 如果用户未登录, 则返回错误信息.
    if (!accountList.length) { return e.reply('当前没有登录任何账号, 请使用 [~登录] 进行登录后再查询每日任务列表.'); }

    // 定义消息数组.
    const data = [];
    const delCK = [];

    // 循环用户的ck, 获取社区任务列表.
    for (const acc of accountList) {
        // 检查用户ck是否可用, 不可用则删除, 并返回错误信息.
        if (!await waves.isAvailable(acc.token)) {
            data.push(`[UID: ${acc.roleId}] 该账号的ck已失效, 请使用 [~登录] 进行登录后重试.`);
            delCK.push(acc.roleId);
            continue;
        }

        // 获取社区任务列表.
        const [ taskList, coinData ] = await Promise.all([
            waves.taskProcess(acc.token),
            waves.getCoin(acc.token),
        ]);

        // 检查任务列表是否获取成功.
        if (!taskList.status || !coinData.status) {
            data.push(`[UID: ${acc.roleId}] 任务列表获取失败, 原因: ${taskList.msg || coinData.msg}`);
        }
        else {
            // 渲染任务列表.
            const img = await Render.render('Template/taskList/taskList', {
                taskData: taskList.data,
                coinData: coinData.data,
            });

            data.push(img);
        }
    }

    // 删除失效ck.
    if (delCK.length) {
        const newAccList = accountList.filter(acc => !delCK.includes(acc.roleId));
        cfg.setUserData(e.user_id, newAccList);
    }

    // 制作消息.
    const msg = data.length === 1
        ? data[0]
        : common.makeForward(
            [`[用户: ${e.user_id}] 任务列表: `, ...data],
            e.bot.account.uin,
            e.bot.account.name,
        );

    // 返回任务列表.
    return data.length === 1
        ? e.reply(msg, { reply: true })
        : e.bot.sendForwardMessage(e.contact, msg);
}, {
    priority: 1009,
    log: true,
    name: '鸣潮-任务列表',
    permission: 'all'
});