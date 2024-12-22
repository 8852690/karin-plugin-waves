import fs from 'fs';
import { join } from 'path';
import cfg from '../utils/config.js';
import wiki from '../components/Wiki.js';
import { common, karin } from 'node-karin';
import { dataPath, resPath } from '../utils/dir.js';;

/**
 * 添加别名.
 * @param {karin.Event} e
 */
const addAliasReg = /^(?:～|~|∽|#?鸣潮)(?:[添增]加|设置)(.*?)(?:别名|昵称)(.*)$/;
export const addAlias = karin.command(addAliasReg, async (e) => {
    // 判断是否有权限.
    if (!e.isAdmin && !cfg.Config.alias.allow_set_alias) { return e.reply('只有主人才能设置别名哦~'); }

    // 匹配正则, 获取参数.
    const [, char, alias] = e.msg.match(addAliasReg);

    // 如果没有 角色名|别名, 则返回错误信息.
    if (!char || !alias) { return e.reply('请输入正确的命令格式, 如: [~添加今汐别名龙女].'); }

    // 判断 角色|别名 是否存在.
    const [entryData, aliasData] = await Promise.all([
        wiki.getEntry(char),
        wiki.getEntry(alias),
    ]);

    // 如果 角色 不存在, 则返回错误信息.
    if (!entryData.status) {
        return e.reply(`俺找遍了整个索拉里斯, 都没找到 ${char} 哦~`);
    }
    // 如果 别名 存在, 则返回错误信息.
    else if (aliasData.status) {
        return e.reply(`别乱来啊, ${alias} 已经存在了哦~`);
    }

    // 检查现有的别名是否已经存在.
    let data = [ ...getAlias(true)[char] || [], ...getAlias(false)[char] || [] ];

    // 如果别名已经存在, 则返回错误信息.
    if (data.includes(alias)) {
        return e.reply(`${alias} 已经是 ${char} 的别名了哦~`);
    }

    // 添加别名.
    data = getAlias(false);
    data[char] = [...(data[char] || []), alias];

    // 保存别名.
    return e.reply(
        common.writeYaml(join(dataPath, 'Alias', 'custom.yaml'), data)
            ? `已经成功为 ${char} 添加别名 ${alias} 了哦~`
            : '别名添加失败, 请联系主人处理~'
    );
}, {
    priority: 1009,
    log: true,
    name: '鸣潮-添加别名',
    permission: 'all'
});

/**
 * 查看别名.
 * @param {karin.Event} e
 */
const viewAliasReg = /^(?:～|~|∽|#?鸣潮)(?:查[看询])?(.*)(?:别名|昵称)(?:列表)?$/;
export const viewAlias = karin.command(viewAliasReg, async (e) => {
    // 匹配正则, 获取参数.
    const char = e.msg.match(viewAliasReg)[1];

    // 如果没有 角色名, 则返回错误信息.
    if (!char) { return e.reply('请输入正确的命令格式, 如: [~查看今汐别名].'); }

    // 获取别名数据.
    const sysAlias = getAlias(true)[char] || [];
    const cusAlias = getAlias(false)[char] || [];

    // 制作别名列表.
    const msg = !sysAlias.length && !cusAlias.length
        ? `${char} 没有任何别名哦~`
        : [
            `角色 ${char} 的别名列表:\n`,
            sysAlias.length ? `系统别名: ${sysAlias.join(', ')}\n` : '',
            cusAlias.length ? `自定义别名: ${cusAlias.join(', ')}\n` : '',
        ].join('');

    // 返回别名列表.
    return e.reply(msg);
}, {
    priority: 1009,
    log: true,
    name: '鸣潮-查看别名',
    permission: 'all'
});

/**
 * 删除别名.
 * @param {karin.Event} e
 */
const delAliasReg = /^(?:～|~|∽|#?鸣潮)(?:删除|取消)(.*?)(?:别名|昵称)(.*)$/;
export const delAlias = karin.command(delAliasReg, async (e) => {
    // 判断是否有权限.
    if (!e.isAdmin && !cfg.Config.alias.allow_set_alias) { return e.reply('只有主人才能设置别名哦~'); }

    // 匹配正则, 获取参数.
    const [, char, alias] = e.msg.match(delAliasReg);

    // 如果没有 角色名|别名, 则返回错误信息.
    if (!char || !alias) { return e.reply('请输入正确的命令格式, 如: [~删除今汐别名龙女].'); }

    // 获取别名数据.
    const data = getAlias(false);

    // 如果别名不存在, 则返回错误信息.
    if (!data[char]) {
        return e.reply(`${char} 没有任何自定义别名哦~`);
    }
    else if (getAlias(true)[char] && getAlias(true)[char].includes(alias)) {
        return e.reply(`无法删除系统别名 ${alias}.`);
    }
    else if (!data[char].includes(alias)) {
        return e.reply(`${alias} 不是 ${char} 的别名哦~`);
    }

    // 删除别名.
    data[char] = data[char].filter((name) => name !== alias);

    // 保存别名.
    return e.reply(
        common.writeYaml(join(dataPath, 'Alias', 'custom.yaml'), data)
            ? `已经成功为 ${char} 删除别名 ${alias} 了哦~`
            : '自定义别名删除失败, 请联系主人处理~'
    );
}, {
    priority: 1009,
    log: true,
    name: '鸣潮-删除别名',
    permission: 'all'
});

/**
 * 读取别名数据.
 * @param {boolean} isSystem 是否读取系统别名.
 * @returns {object} 别名数据.
 * @example { '角色名': ['别名1', '别名2'] }
 */
function getAlias(isSystem = false) {
    // 自定义别名文件路径.
    const cusAlias = join(dataPath, 'Alias', 'custom.yaml');

    // 如果自定义别名文件不存在, 则创建一个.
    if (!common.exists(cusAlias)) { common.writeYaml(cusAlias, {}); }

    // 系统别名目录.
    const sysAliasDir = join(resPath, 'Alias');

    // 返回别名数据.
    return isSystem
        ? fs.readdirSync(sysAliasDir)
            .map((file) => common.readYaml(join(sysAliasDir, file)))
            .reduce((acc, cur) => ({ ...acc, ...cur }), {})
        : common.readYaml(cusAlias);
};
