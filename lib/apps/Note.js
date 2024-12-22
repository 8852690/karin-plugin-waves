import cfg from '../utils/config.js';
import waves from '../components/Code.js';
import Render from '../components/render.js';
import { common, karin, redis, segment } from 'node-karin';

/**
 * 体力值查询
 * @param {karin.Event} e
 */
const noteReg = /^(～|~|∽|#?鸣潮)(波片|体力|日常数据)$/;
export const note = karin.command(noteReg, async (e) => {
    // 获取用户的ck.
    const accountList = JSON.parse(await redis.get(`karin:waves:users:${e.user_id}`)) || cfg.getUserData(e.user_id);

    // 如果用户未登录, 则返回错误信息.
    if (!accountList.length) { return e.reply('当前没有登录任何账号, 请使用 [~登录] 进行登录后查看.'); }

    // 定义几个数组, 用来存数据.
    const data = [];
    const delCK = [];

    // 循环用户的ck, 获取体力值.
    for (const acc of accountList) {
        // 检查用户ck是否可用, 不可用则删除, 并返回错误信息.
        if (!await waves.isAvailable(acc.token)) {
            data.push(`[UID: ${acc.roleId}] 该账号的ck已失效, 请使用 [~登录] 进行登录后重试.`);
            delCK.push(acc.roleId);
            continue;
        }

        // 获取体力值.
        const res = await waves.getGameData(acc.token);

        // 若获取失败, 则返回错误信息.
        if (!res.status) { data.push(`[UID: ${acc.roleId}] 获取体力值失败: ${res.msg}`); continue; }

        // 渲染体力图片.
        const img = await Render.render('Template/dailyData/dailyData', {
            avatarUrl: e.bot.getAvatarUrl(e.user_id),
            gameData: res.data,
        });

        data.push(img);
    }

    // 删除失效的ck.
    if (delCK.length) {
        const newAccList = accountList.filter(acc => !delCK.includes(acc.roleId));
        cfg.setUserData(e.user_id, newAccList);
    }

    // 制作消息.
    const msg = data.length === 1
        ? data[0]
        : common.makeForward(
            [segment.text(`[用户: ${e.user_id}] 体力查询结果:`), ...data],
            e.bot.account.uin,
            e.bot.account.name,
        );
    
    // 返回体力查询结果.
    return data.length === 1
        ? e.reply(msg, { reply: true })
        : e.bot.sendForwardMessage(e.contact, msg);
}, {
    priority: 1009,
    log: true,
    name: '鸣潮-体力查询',
    permission: 'all',
});