import fs from 'fs';
import { join } from 'path';
import cfg from '../utils/config.js';
import wiki from '../components/Wiki.js';
import { resPath } from '../utils/dir.js';
import { common, karin, segment } from 'node-karin';

const Authors = [
    { name: '小沐XMu', path: '/Strategy/XMu/' },
    { name: 'Moealkyne', path: '/Strategy/moealkyne/' },
    { name: '金铃子攻略组', path: '/Strategy/Linn/' },
];

/**
 * 获取角色攻略.
 * 返回用户定义的攻略, 若无指定攻略则抛出错误.
 * @param {karin.Event} e
 */
const strategyReg = /^(?:～|~|∽|#?鸣潮)?(.*)攻略$/;
export const Strategy = karin.command(strategyReg, async (e) => {
    // 匹配用户消息, 获取角色名
    const message = e.msg.match(strategyReg)[1];

    // 若未提供角色名, 则返回错误信息.
    if (!message) { return e.reply('请输入正确的命令格式, 如: [～今汐攻略]'); }

    // 矫正角色别名.
    const charName = wiki.getAlias(message);

    // 定义消息数组.
    const data = [];

    // 读取配置, 获取用户定义的攻略.
    const provide = cfg.Config.public.strategy_provide;

    // 若为all, 则返回所有攻略.
    if (provide === 'all') {
        for (const auth of Authors) {
            const imgPath = join(resPath, auth.path, `${charName}.jpg`);
            if (fs.existsSync(imgPath)) {
                data.push(`来自 ${auth.name} 的攻略: `, segment.image(imgPath));
            }
        }
    }
    else {
        const imgPath = join(resPath, provide, `${charName}.jpg`);
        if (fs.existsSync(imgPath)) {
            data.push(segment.image(imgPath));
        }
    }

    // 若无攻略, 并且以鸣潮消息字段开头, 则返回错误信息.
    if (!data.length) {
        return (/^(～|~|∽|#?鸣潮)/.test(e.msg)) ? e.reply(`暂无 ${charName} 的攻略`) : false;
    }

    // 制作消息.
    const msg = data.length === 1
        ? data[0]
        : common.makeForward(
            [`${charName} 攻略`, ...data],
            e.bot.account.uin,
            e.bot.account.name,
        );
    
    // 返回攻略查询结果.
    return data.length === 1
        ? e.reply(msg)
        : e.bot.sendForwardMessage(e.contact, msg);
});