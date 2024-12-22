import fs from 'fs';
import { join } from 'path';
import { resPath } from '../utils/dir.js';
import { karin, segment } from 'node-karin';

/**
 * 随机表情包
 * @param {karin.Event} e
 */
const emojiReg = /^(?:～|~|∽|#?鸣潮)(随机)?表情包?$/;
export const Emoji = karin.command(emojiReg, async (e) => {
    // 读取表情包目录.
    const emojis = fs.readdirSync(join(resPath, 'emojis'));

    // 随机选择一个表情包.
    const emoji = join(resPath, 'emojis', emojis[Math.floor(Math.random() * emojis.length)]);

    // 返回表情包.
    return e.reply(segment.image(`file://${emoji}`));
}, {
    priority: 1009,
    log: true,
    name: '鸣潮-随机表情包',
    permission: 'all',
});