import fs from 'fs';
import { join, extname } from 'path';
import cfg from '../utils/config.js';
import wiki from '../components/Wiki.js';
import waves from '../components/Code.js';
import { dataPath } from '../utils/dir.js';
import Render from '../components/render.js';
import WeightCalculator from '../utils/Calculate.js';
import { karin, redis, common, segment } from 'node-karin';

/**
 * 角色面板查询
 * 查询用户角色面板数据.
 * @param {karin.Event} e
 */
const charReg = /^(?:～|~|∽|#?鸣潮)(.*)面板(\d{9})?$/;
export const character = karin.command(charReg, async (e) => {
    const user = e.at.shift() || e.user_id;

    // 匹配用户消息, 获取角色名和可能存在的特征码.
    const [char, uid] = e.msg.match(charReg).slice(1);

    // 若未提供角色名, 则返回错误信息.
    if (!char) { return e.reply(`请正确的使用命令, 如: [~安可面板] 进行查看.`, { reply: true }); }

    // 获取用户的ck.
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

    // 矫正角色别名.
    let charName = wiki.getAlias(char);

    // 定义几个数组, 用来存数据.
    const data = [];
    const delCK = [];
    let imgList = [];

    // 获取用户角色数据.
    for (const acc of accountList) {
        // 检查用户ck是否可用, 不可用则删除, 并返回错误信息.
        if (!await waves.isAvailable(acc.token)) {
            data.push(`[UID: ${acc.roleId}] 该账号的ck已失效, 请使用 [~登录] 进行登录后重试.`);
            delCK.push(acc.roleId);
            continue;
        }

        // 如果是他人的uid, 则绑定uid.
        if (uid) {
            acc.roleId = uid;
            await redis.set(`karin:waves:bind:${user}`, acc.roleId);
        }

        // 获取用户展示的角色列表.
        const charList = await waves.getRoleData(acc.serverId, acc.roleId, acc.token);

        // 如果获取异常, 则返回错误信息.
        if (!charList.status) { data.push(`[UID: ${acc.roleId}] ${charList.msg}`); continue; }

        // 处理主角名称.
        if (charName.includes('漂泊者')) {
            charName = charName.replace(/-男-|-女-/g, '·');
        }

        // 遍历角色列表, 检查角色列表中是否展示该角色.
        const char = charList.data.roleList.find(role => role.roleName === charName);

        // 若未展示, 则返回错误信息.
        if (!char) { data.push(`[UID: ${acc.roleId}] 该账号尚未拥有共鸣者 ${charName}.`); continue; }

        // 获取角色面板详细数据.
        const roleDetail = await waves.getRoleDetail(acc.serverId, acc.roleId, char.roleId, acc.token);

        // 若获取异常, 则返回错误信息.
        if (!roleDetail.status) { data.push(`[UID: ${acc.roleId}] ${roleDetail.msg}`); continue; }

        // 如果角色未展示, 则返回错误信息.
        if (!roleDetail.data.role) {
            const showroleList = roleDetail.data.showRoleIdList.map(roleId => {
                const role = roleDetail.data.roleList.find(role => role.roleId === roleId || role.mapRoleId === roleId);
                return role ? role.roleName : null;
            }).filter(Boolean);

            data.push(`[UID: ${acc.roleId}] 该账号未在库街区展示共鸣者 ${charName}.\n\n当前展示的共鸣者有: ${showroleList.join(', ')}\n\n使用 [~登录] 进行登录后即可查看所有角色信息.`);
            continue;
        }

        // 定义角色面板图路径.
        const rolePicDir = join(dataPath, 'RolePic', charName);

        // 获取所有的webp格式面板图.
        const webpFiles = fs.existsSync(rolePicDir)
            ? fs.readdirSync(rolePicDir).filter(file => extname(file).toLowerCase() === '.webp')
            : [];

        // 随机获取一张面板图, 目录为空时使用角色详细数据中的图.
        const rolePicUrl = webpFiles.length
            ? `file://${join(rolePicDir, webpFiles[Math.floor(Math.random() * webpFiles.length)])}`
            : roleDetail.data.role.rolePicUrl;

        // 将角色面板图添加到图片列表中, 后续保存面板图用于用户获取原图.
        imgList.push(rolePicUrl);

        // 角色面板权重计算.
        roleDetail.data = (new WeightCalculator(roleDetail.data)).calculate();

        // 渲染角色面板.
        const img = await Render.render('Template/charProfile/charProfile', {
            data: { uid: acc.roleId, rolePicUrl, roleDetail }
        });

        data.push(img);

        // 如果是他人的uid, 则跳出循环.
        if (uid) { break; }
    };

    // 删除失效的ck.
    if (delCK.length) {
        const newAccList = accountList.filter(acc => !delCK.includes(acc.roleId));
        cfg.setUserData(user, newAccList);
    }

    // 制作消息.
    const msg = data.length === 1
        ? data[0]
        : common.makeForward(
            [segment.text(`[用户: ${user}] 共鸣者 ${charName} 面板数据如下: `), ...data],
            e.bot.account.uin,
            e.bot.account.name,
        );

    // 返回用户角色面板数据.
    const msgRes = data.length === 1
        ? await e.reply(msg, { reply: true })
        : await e.bot.sendForwardMessage(e.contact, msg);

    // 获取发送的消息ID, 用于后续获取原图.
    const msgId = Array.isArray(msgRes.message_id)
        ? msgRes.message_id
        : typeof msgRes.message_id === 'object' && msgRes.message_id.message_id
            ? [msgRes.message_id.message_id].filter(Boolean) // ncqq的返回好怪啊.
            : [msgRes.message_id].filter(Boolean);

    // 过滤重复的图片链接.
    imgList = [...new Set(imgList)];

    // 保存图片链接至redis, 用于用户获取原图.
    for (const id of msgId) {
        await redis.set(`karin:waves:originPic:${id}`, JSON.stringify({ type: 'profile', img: imgList }), { EX: 3600 });
    }

    // 返回响应结果.
    return true;
}, {
    priority: 1009,
    log: true,
    name: '鸣潮-角色面板',
    permission: 'all'
});