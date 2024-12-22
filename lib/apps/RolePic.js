import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import pLimit from 'p-limit';
import cfg from '../utils/config.js';
import wiki from '../components/Wiki.js';
import { randomUUID, createHash } from 'crypto';
import { basename, dataPath } from '../utils/dir.js';
import { common, segment, karin, redis, logger } from 'node-karin';

// 定义面板图根目录.
const rolePicPath = path.join(dataPath, 'RolePic');

/**
 * 上传面板图片
 * Karin暂不支持引用转发消息获取图片, 请消息在包含图片或引用包含图片的消息.
 * @param {karin.Event} e
 */
const imgUploadReg = /^(?:～|~|∽|#?鸣潮)上传(.*)面板图$/;
export const imgUpload = karin.command(imgUploadReg, async (e) => {
    // 校验是否允许上传图片.
    if (!e.isAdmin && !cfg.Config.charPanel.allow_img_upload) { return e.reply('只有 主人/管理员 才能上传面板图哦~'); }

    // 匹配用户消息, 获取角色名, 若未提供角色名, 则返回错误信息.
    let char = e.msg.match(imgUploadReg)[1];
    if (!char) { return e.reply(`请正确的使用命令, 如: [~上传安可面板图] 进行上传.`); }

    // 矫正角色别名, 并判断角色是否存在.
    char = wiki.getAlias(char);
    if (!(await wiki.getEntry(char, '1105')).status) { return e.reply(`未找到角色: ${char}`); }

    // 尝试获取 当前/引用 消息中的图片, 若未获取到图片, 尝试获取下文中的图片.
    const images = await getImages(e);

    // 若未获取到图片, 则返回错误信息.
    if (!images.length) { return e.reply('在消息中未找到图片, 已取消操作.'); }

    // 上传图片.
    const res = await uploadImages(char, images);
    const failedList = res.filter(r => r.status === 'rejected');

    // 返回上传结果.
    if (failedList.length) {
        const failMsg = failedList.map(f => f.reason).join('\n');
        return e.reply(`部分图片上传失败:\n${failMsg}`);
    }
    else { return e.reply(`上传 ${char} 面板图成功, 本次共上传 ${res.length} 张图片.`); }
}, {
    priority: 1009,
    log: true,
    name: '鸣潮-上传面板图',
    permission: 'all'
});

/**
 * 获取原图
 * 获取面板图消息中的原图.
 * @param {karin.Event} e
 */
const originalPicReg = /^(?:～|~|∽|#?鸣潮)原图$/;
export const originalPic = karin.command(originalPicReg, async (e) => {
    // 校验是否允许获取原图.
    if (!e.isAdmin && !cfg.Config.charPanel.allow_get_origin) { return e.reply('只有 主人/管理员 才能获取原图哦~'); }

    // 尝试获取引用消息的消息id, 若未获取到, 则返回错误信息.
    if (!e.reply_id) { return e.reply('请引用包含图片的消息.'); }

    // 尝试从 redis 中获取消息记录.
    const res = await redis.get(`karin:waves:originPic:${e.reply_id}`);

    // 若未获取到记录, 则返回错误信息.
    if (!res) { return e.reply(segment.image('https://gchat.qpic.cn/gchatpic_new/746659424/4144974507-2439053290-125E4E51B9D45F2C955E6675AF7C6CEE/0?term=3&is_origin=0')); }

    // 获取图片链接数组.
    const images = JSON.parse(res).img || [];

    // 制作消息.
    const msg = images.length === 1
        ? segment.image(images[0])
        : common.makeForward(
            [...images.map(img => segment.image(img))],
            e.bot.account.uin,
            e.bot.account.name,
        );
    
    // 返回消息.
    return images.length === 1
        ? e.reply(msg, { reply: true })
        : e.bot.sendForwardMessage(e.contact, msg);
});

/**
 * 获取面板图列表
 * 获取角色的面板图列表.
 * @param {karin.Event} e
 */
const imgListReg = /^(?:～|~|∽|#?鸣潮)(.*)面板图列表$/;
export const imgList = karin.command(imgListReg, async (e) => {
    // 校验是否允许获取面板图列表.
    if (!e.isAdmin && !cfg.Config.charPanel.allow_get_list) { return e.reply('只有 主人/管理员 才能获取面板图列表哦~'); }

    // 匹配用户消息, 获取角色名, 若未提供角色名, 则返回错误信息.
    let char = e.msg.match(imgListReg)[1];
    if (!char) { return e.reply(`请正确的使用命令, 如: [~安可面板图列表] 进行查询.`); }

    // 矫正角色别名, 并判断角色是否存在(暂不做判断).
    char = wiki.getAlias(char);
    // if (!(await wiki.getEntry(char, '1105')).status) { return e.reply(`未找到角色: ${char}`); }

    // 定义图片目录, 并读取目录下的文件.
    const imgDir = path.join(rolePicPath, char);
    const files = fs.existsSync(imgDir) ? fs.readdirSync(imgDir) : [];

    // 若文件夹为空, 则返回错误信息.
    if (!files.length) { return e.reply(`未找到 ${char} 的面板图.`); }

    // 制作消息.
    const msg = common.makeForward(
        [
            `角色 ${char} 的面板图列表:`,
            ...files.map((f, i) => [`${i + 1}. `, segment.image(`file://${path.join(imgDir, f)}`)]),
            `请注意: 面板图均为网络采集或网友上传, 请勿用于商业用途, 仅供学习交流使用.\n如果这些图片侵犯了您的权益, 请及时联系我们删除, ${e.bot.account.name}主人不负任何法律责任`,
            `如需删除图片, 请使用 "~删除${char}面板图1" 删除第一张图片, 以此类推`,
        ],
        e.bot.account.uin,
        e.bot.account.name,
    );

    // 返回消息.
    return e.bot.sendForwardMessage(e.contact, msg);
});

/**
 * 删除面板图
 * 删除角色的面板图.
 * @param {karin.Event} e
 */
const imgDeleteReg = /^(?:～|~|∽|#?鸣潮)删除(.*)面板图(\d+)$/;
export const imgDelete = karin.command(imgDeleteReg, async (e) => {
    // 校验是否允许删除图片.
    if (!e.isAdmin && !cfg.Config.charPanel.allow_img_delete) { return e.reply('只有 主人/管理员 才能删除面板图哦~'); }

    // 匹配用户消息, 获取角色名和图片序号, 若未提供角色名或图片序号, 则返回错误信息.
    const [char, index] = e.msg.match(imgDeleteReg).slice(1);
    if (!char || !index) { return e.reply(`请正确的使用命令, 如: [~删除安可面板图1] 进行删除.`); }

    // 矫正角色别名, 并判断角色是否存在(暂不做判断).
    const charName = wiki.getAlias(char);
    // if (!(await wiki.getEntry(char, '1105')).status) { return e.reply(`未找到角色: ${charName}`); }

    // 定义图片目录, 并读取目录下的文件.
    const imgDir = path.join(rolePicPath, charName);
    const files = fs.existsSync(imgDir) ? fs.readdirSync(imgDir) : [];

    // 若文件夹为空, 则返回错误信息.
    if (!files.length) { return e.reply(`未找到 ${charName} 的面板图.`); }

    // 校验图片序号是否合法.
    const imgIndex = parseInt(index) - 1;
    if (imgIndex < 0 || imgIndex >= files.length) { return e.reply(`图片序号不合法, 请重新输入.`); }

    // 删除图片.
    fs.unlinkSync(path.join(imgDir, files[imgIndex]));

    // 返回删除成功信息.
    return e.reply(`删除 ${charName} 第 ${index} 张面板图成功.`);
}, {
    priority: 1009,
    log: true,
    name: '鸣潮-删除面板图',
    permission: 'all'
});

// 工具函数

/**
 * 获取消息中的图片
 * 返回一个包含图片链接的数组.
 * @param {karin.Event} e
 * @param {boolean} [isRecursion=false] 是否处于递归状态。
 * @returns {Promise<string[]>} 图片链接数组
 */
async function getImages(e, isRecursion = false) {
    // 匹配消息中肯恩包含的图片.
    let images = e.image;

    // 若引用了消息, 则尝试获取引用消息中的图片.
    if (e.reply_id) {
        // 定义变量存储引用消息.
        let source;

        // 尝试获取引用消息内容.
        try {
            source = await e.bot.GetMessage(e.contact, e.reply_id);
        } catch (err) { logger.error(logger.blue(`[${basename}]`, ' [imgUpload] 获取引用消息失败:'), err); }

        // 若存在引用消息, 则获取引用消息中的图片.
        if (source) {
            // 循环消息数组, 获取消息中的图片.
            for (const msg of source.elements) {
                if (msg.type === 'image') {
                    images.push(msg.file);
                }

                // TODO: 支持获取引用历史记录中的图片.
            }
        }
    }

    // 如果消息中没有图片, 则定义上下文, 尝试从下文中获取图片.
    if (!images.length && !isRecursion) {
        e.reply('请发送图片或引用包含图片的消息.');
        const context = await karin.ctx(e, { reply: true, time: 60, replyMsg: '超时已取消.' });

        // 递归调用获取图片.
        const img = await getImages(context, true);

        // 合并图片数组.
        images = images.concat(img);
    }
    
    // 返回图片数组.
    return images;
}

/**
 * 异步上传图片
 * @param {string} char 角色名
 * @param {string[]} imgs 图片链接数组
 * @returns {Promise<string[]>} 上传结果数组
 */
async function uploadImages(char, imgs) {
    // 定义图片目录, 并创建目录.
    const imgDir = path.join(rolePicPath, char);
    common.mkdir(imgDir);

    // 定义并发限制.
    const limit = pLimit(cfg.Config.public.limit || 10);

    // 定义异步下载函数.
    const downloadPromise = imgs.map((img, index) =>
        // 并发控制, 防止大量请求导致服务器卡顿.
        limit(async () => {
            // 定义图片路径.
            const imgPath = path.join(imgDir, `${randomUUID()}.webp`);

            // 下载并校验下载结果.
            logger.debug(logger.blue(`[${basename}]`), ` [imgUpload] 正在下载第 ${index + 1} 张图片: ${img}`);
            if (!await downloadFile(img, imgPath, 60 * 1000)) {
                logger.error(logger.blue(`[${basename}]`), ` [imgUpload] 下载图片失败: ${img}`);
                await fs.promises.unlink(imgPath);
                throw new Error(`下载图片失败: ${img}`);
            }
            logger.debug(logger.blue(`[${basename}]`), ` [imgUpload] 第 ${index + 1} 张图片下载完毕.`);

            // 校验图片md5, 若图片md5相同, 则删除图片.
            if (!await isUnique(imgDir, imgPath)) {
                fs.unlinkSync(imgPath);
                logger.warn(logger.blue(`[${basename}]`), ` [imgUpload] 第 ${index + 1} 张图片重复, 已删除.`);
                return `第 ${index + 1} 张图片重复, 已删除`;
            }

            // 返回下载成功信息.
            return `第 ${index + 1} 张图片上传成功`;
        })
    );

    return await Promise.allSettled(downloadPromise);
}

/**
 * 下载文件
 * @param {string} url 文件链接
 * @param {string} dest 文件存储路径
 * @param {number} timeout 下载超时时间
 * @returns {Promise<boolean>} 下载结果
 */
async function downloadFile(url, dest, timeout) {
    // 访问图片链接, 并返回结果.
    try {
        const res = await common.axios(url, 'get', { responseType: 'stream', timeout });

        // 下载图片.
        await new Promise((resolve, reject) => {
            res.data
                .pipe(sharp().webp())
                .pipe(fs.createWriteStream(dest))
                .on('finish', resolve)
                .on('error', reject);
        });

        // 返回下载成功标记.
        return true;
    } catch (err) {
        // 记录错误信息, 并返回下载失败标记.
        logger.error(logger.blue(`[${basename}]`), ` [imgUpload] 下载图片失败: ${url}`);
        logger.error(err);
        return false;
    }
}

/**
 * 校验图片是否唯一.
 * 异步校验图片md5, 若存在相同md5, 则返回false.
 * @param {string} dir 文件夹路径
 * @param {string} file 文件路径
 * @returns {Promise<boolean>} 是否唯一
 */
async function isUnique(dir, file) {
    // 获取文件md5.
    const imgHash = await getFileMD5(file);

    // 获取文件夹下除当前文件外的所有文件.
    const files = fs.readdirSync(dir).filter(f => f !== path.basename(file));

    // 定义并发限制.
    const limit = pLimit((cfg.Config.public.limit || 10) * 2);

    // 异步校验文件md5, 若存在相同md5, 则抛出错误.
    const checkPromise = files.map(f => 
        // 并发控制, 防止大量文件导致卡顿.
        limit(async () => { 
            // 计算文件md5.
            const hash = await getFileMD5(path.join(dir, f));

            // 若文件md5相同, 则抛出错误.
            if (hash === imgHash) { throw new Error(`图片重复: ${f}`); }

            // 返回校验结果.
            return true;
        })
    );

    // 返回校验结果, 不唯一则返回false, 否则返回true.
    try {
        await Promise.all(checkPromise);
        return true;
    } catch { return false; }
}

/**
 * 读取文件, 计算文件md5
 * @param {string} filePath 文件路径
 * @returns {Promise<string>} 文件md5
 */
async function getFileMD5(filePath) {
    const file = await fs.promises.readFile(filePath);
    return createHash('md5').update(file).digest('hex');
}