import cfg from '../utils/config.js';
import { karin, redis } from 'node-karin';

/**
 * 设置: 自动签到
 * @param {karin.Event} e
 * @example ~开启自动签到
 */
const setAutoSignReg = /^(?:~|~|∽|#?鸣潮)(设置|开启|启用|关闭|禁用)?(?:自动|定时)(?:签到|任务)$/;
export const setAutoSign = karin.command(setAutoSignReg, async (e) => {
    // 获取用户的ck, 若用户未登录, 则返回错误信息.
    const accountList = JSON.parse(await redis.get(`karin:waves:users:${e.user_id}`)) || cfg.getUserData(e.user_id);
    if (!accountList.length) { return e.reply('当前没有登录任何账号, 请使用 [~登录] 进行登录后重试.'); }

    // 匹配消息, 获取用户的设置.
    const act = /开启|启用/.test(e.msg.match(setAutoSignReg)[1]);

    // 定义数据.
    const itm = {
        botId: e.bot.account.uin.toString(),
        groupId: e.group_id.toString() || '',
        userId: e.user_id.toString(),
    };

    // 获取当前用户的设置.
    const userCfg = cfg.taskList.waves_auto_signin_list.findIndex(u => u.userId === itm.userId);

    // 若用户选择开启
    if (act) {
        // 若用户未开启, 则添加到任务列表.
        if (userCfg === -1) {
            const status = cfg.taskListCfg('append', 'waves_auto_signin_list', itm);
            return e.reply(status ? '已开启自动签到.' : '操作失败, 请稍后重试.', { reply: true });
        } else { return e.reply('😅你已经开启过 自动签到 了, 开那么多次干嘛'); }
    }
    else {
        // 若用户已开启, 则从任务列表中删除.
        if (userCfg !== -1) {
            const status = cfg.taskListCfg('remove', 'waves_auto_signin_list', itm);
            return e.reply(status ? '已关闭自动签到.' : '操作失败, 请稍后再试.', { reply: true });
        } else { return e.reply('😅你还没开启 自动签到 呢, 无需关闭'); }
    }
}, {
    priority: 1009,
    log: true,
    name: '鸣潮-设置: 自动签到',
    permission: 'all',
});

/**
 * 设置: 体力推送
 * @param {karin.Event} e
 * @example ~开启体力推送
 */
const setNotePushReg = /^(?:~|~|∽|#?鸣潮)(设置|开启|启用|关闭|禁用)?(?:体力|[波玻泊]片)推送$/;
export const setNotePush = karin.command(setNotePushReg, async (e) => {
    // 获取用户的ck, 若用户未登录, 则返回错误信息.
    const accountList = JSON.parse(await redis.get(`karin:waves:users:${e.user_id}`)) || cfg.getUserData(e.user_id);
    if (!accountList.length) { return e.reply('当前没有登录任何账号, 请使用 [~登录] 进行登录后重试.'); }

    // 匹配消息, 获取用户的设置.
    const act = /设置|开启|启用/.test(e.msg.match(setNotePushReg)[1]);

    // 定义数据.
    const itm = {
        botId: e.bot.account.uin.toString(),
        groupId: e.group_id.toString() || '',
        userId: e.user_id.toString(),
        threshold: 220,
    };

    // 获取当前用户的设置.
    const userCfg = cfg.taskList.waves_auto_push_list.findIndex(u => u.userId === itm.userId);

    // 若用户选择开启
    if (act) {
        // 若用户未开启, 则添加到任务列表.
        if (userCfg === -1) {
            const status = cfg.taskListCfg('append', 'waves_auto_push_list', itm);
            return e.reply(status ? '已开启体力推送.' : '操作失败, 请稍后重试.', { reply: true });
        } else { return e.reply('😅你已经开启过 体力推送 了, 开那么多次干嘛'); }
    }
    else {
        // 若用户已开启, 则从任务列表中删除.
        if (userCfg !== -1) {
            const status = cfg.taskListCfg('remove', 'waves_auto_push_list', itm);
            return e.reply(status ? '已关闭体力推送.' : '操作失败, 请稍后再试.', { reply: true });
        } else { return e.reply('😅你还没开启 体力推送 呢, 无需关闭'); }
    }
}, {
    priority: 1009,
    log: true,
    name: '鸣潮-设置: 体力推送',
    permission: 'all',
});

/**
 * 设置: 公告推送
 * @param {karin.Event} e
 * @example ~开启公告推送
 */
const setNewsPushReg = /^(?:~|~|∽|#?鸣潮)(设置|开启|启用|关闭|禁用)?(?:公告|新闻|活动|资讯)推送$/;
export const setNewsPush = karin.command(setNewsPushReg, async (e) => {
    // 如果是群聊, 判断是否为管理员/群主.
    if (e.isGroup) {
        if (
            !e.isMaster && 
            !e.isAdmin && 
            !e.sender.role === 'owner' && 
            !e.sender.role === 'admin'
        ) { return e.reply('只有管理员和群主才能开启活动推送.', { reply: true }); }
    }
    // 匹配消息, 获取用户的设置.
    const act = /设置|开启|启用/.test(e.msg.match(setNewsPushReg)[1]);

    // 定义数据.
    const itm = {
        botId: e.bot.account.uin.toString(),
        groupId: e.isGroup ? e.group_id.toString() : '',
        userId: e.isGroup ? '' : e.user_id.toString(),
    };

    // 获取当前用户的设置.
    const userCfg = cfg.taskList.waves_auto_news_list.findIndex(u =>{
        return u.groupId ? u.groupId === itm.groupId : u.userId === itm.userId;
    });

    // 若用户选择开启
    if (act) {
        // 若用户未开启, 则添加到任务列表.
        if (userCfg === -1) {
            const status = cfg.taskListCfg('append', 'waves_auto_news_list', itm);
            return e.reply(status ? '已开启公告推送.' : '操作失败, 请稍后重试.', { reply: true });
        } else { return e.reply('😅你已经开启过 公告推送 了, 开那么多次干嘛'); }
    }
    else {
        // 若用户已开启, 则从任务列表中删除.
        if (userCfg !== -1) {
            const status = cfg.taskListCfg('remove', 'waves_auto_news_list', itm);
            return e.reply(status ? '已关闭公告推送.' : '操作失败, 请稍后再试.', { reply: true });
        } else { return e.reply('😅你还没开启 公告推送 呢, 无需关闭'); }
    }
}, {
    priority: 1009,
    log: true,
    name: '鸣潮-设置: 公告推送',
    permission: 'all',
});

/**
 * 设置: 体力推送阈值
 * @param {karin.Event} e
 * @example ~设置体力阈值为220
 */
const setNoteThresholdReg = /^(~|~|∽|#?鸣潮)(设置|修改)?(体力|[波玻泊]片)(推送)?阈值为?/;
export const setNoteThreshold = karin.command(setNoteThresholdReg, async (e) => {
    if (!cfg.taskList.waves_auto_push_list.some(u => u.userId === e.user_id.toString())) {
        return e.reply('请先开启体力推送后再设置阈值.', { reply: true });
    }

    // 匹配消息, 获取用户的设置.
    const threshold = e.msg.replace(setNoteThresholdReg, '').trim();

    if (!/^\d+/.test(threshold)) {
        return e.reply('请输入正确的数字, 如: [~设置体力推送阈值为220].', { reply: true });
    } else if (Number(threshold) > 240 || Number(threshold) < 0) {
        return e.reply('体力推送阈值范围为 0~240.', { reply: true });
    } else {
        const itm = {
            botId: e.bot.account.uin.toString(),
            groupId: e.group_id.toString() || '',
            userId: e.user_id.toString(),
            threshold: parseInt(threshold),
        };

        const userCfg = cfg.taskList.waves_auto_push_list.findIndex(u => u.userId === itm.userId);
        const status = cfg.taskListCfg('set', `waves_auto_push_list.${userCfg}`, itm);

        return e.reply(status ? '已设置体力推送阈值.' : '操作失败, 请稍后重试.', { reply: true });
    }
}, {
    priority: 1009,
    log: true,
    name: '鸣潮-设置: 体力推送阈值',
    permission: 'all',
});