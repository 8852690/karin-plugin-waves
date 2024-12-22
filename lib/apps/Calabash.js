import cfg from '../utils/config.js';
import waves from '../components/Code.js';
import Render from '../components/render.js';
import { common, karin, redis, segment } from 'node-karin';

/**
 * 数据坞查询
 * @param {karin.Event} e
 */
const calabashReg = /^(?:～|~|∽|#?鸣潮)(?:数据坞|声[骸骇])(\d{9})?$/;
export const Calabash = karin.command(calabashReg, async (e) => {
    const user = e.at.shift() || e.user_id;

    // 匹配用户消息, 获取深渊名和可能存在的特征码.
    const uid = e.msg.match(calabashReg)[1];

    // 获取用户ck.
    const accountList = JSON.parse(await redis.get(`karin:waves:users:${user}`)) || cfg.getUserData(user);

    // 若用户未登录, 则尝试获取公用ck.
    if (!accountList.length) {
        if (uid || await redis.get(`karin:waves:bind:${user}`)) {
            // 获取公用ck.
            const publicCookie = await waves.pubCookie();

            // 若未获取到公用ck, 则返回错误信息.
            if (!publicCookie) {
                return e.reply('当前没有可用的ck, 请使用 [~登录] 进行登录后查看.');
            }
            else {
                // 绑定用户与uid.
                if (uid) {
                    publicCookie.roleId = uid;
                    await redis.set(`karin:waves:bind:${user}`, publicCookie.roleId);
                }

                // 如果用户已经绑定过uid, 则使用绑定的uid.
                else if (await redis.get(`karin:waves:bind:${user}`)) {
                    publicCookie.roleId = await redis.get(`karin:waves:bind:${user}`);
                }

                // 将公用ck添加到用户数据中.
                accountList.push(publicCookie);
            }
        }
        // 若未登录, 且未绑定uid, 则返回错误信息.
        else { return e.reply('当前没有登录任何账号，请使用 [~登录] 进行登录后查看.'); }
    }

    // 定义几个数组, 用来存数据.
    const data = [];
    const delCK = [];

    // 循环获取挑战数据.
    for (const acc of accountList) {
        // 检查用户ck是否可用, 若不可用则删除, 并返回错误信息.
        if (!await waves.isAvailable(acc.token)) {
            data.push(`[UID: ${acc.roleId}] 该用户的ck已失效, 请使用 [~登录] 重新登录后查看.`);
            delCK.push(acc.roleId);
            continue;
        }

        // 如果是他人的uid, 则绑定uid.
        if (uid) {
            acc.roleId = uid;
            await redis.set(`karin:waves:bind:${user}`, acc.roleId);
        }

        // 获取数据坞数据.
        const [ baseData, calabashData ] = await Promise.all([
            waves.getBaseData(acc.serverId, acc.roleId, acc.token),
            waves.getCalabashData(acc.serverId, acc.roleId, acc.token),
        ]);

        // 检查是否获取到数据.
        if (!baseData.status || !calabashData.status) {
            data.push(`[UID: ${acc.roleId}] 未获取到数据坞数据, 原因: ${baseData.msg || calabashData.msg}`);
        }
        else {
            // 检查是否存在数据坞数据, 若不存在则初始化.
            if (!calabashData.data.phantomList) { calabashData.data.phantomList = []; }

            // 排下序.
            calabashData.data.phantomList.sort((a, b) => b.star - a.star);

            // 渲染数据坞数据.
            const img = await Render.render('Template/calaBash/calaBash', {
                avatarUrl: (!uid && await redis.get(`karin:waves:users:${user}`)) ? e.bot.getAvatarUrl(user) : '',
                baseData: baseData.data,
                calabashData: calabashData.data,
            });

            data.push(img);
        }

        // 如果是他人的uid, 则跳出循环.
        if (uid) { break; }
    }

    // 删除失效的ck.
    if (delCK.length) {
        const newAccList = accountList.filter(acc => !delCK.includes(acc.roleId));
        cfg.setUserData(user, newAccList);
    }

    // 制作消息.
    const msg = data.length === 1
        ? data[0]
        : common.makeForward(
            [segment.text(`[用户: ${user}] 声骇查询结果:`), ...data],
            e.bot.account.uin,
            e.bot.account.name,
        );
    
    // 返回深渊查询结果.
    return data.length === 1
        ? e.reply(msg, { reply: true })
        : e.bot.sendForwardMessage(e.contact, msg);
}, {
    priority: 1009,
    log: true,
    name: '鸣潮-数据坞',
    permissions: 'all',
});