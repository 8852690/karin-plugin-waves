import cfg from '../utils/config.js';
import waves from '../components/Code.js';
import Server from '../components/Server.js';
import { Cfg, karin, redis, segment } from 'node-karin';

/**
 * 绑定特征码
 * 尝试绑定用户提供的特征码.
 * @param {karin.Event} e
 */
const bindReg = /^(?:～|~|∽|#?鸣潮)绑定(.*)$/;
export const Bind = karin.command(bindReg, async (e) => {
    const uid = e.msg.match(bindReg)[1];

    // 尝试匹配9位数字, 若匹配则绑定特征码.
    if (/^\d{9}$/.test(e.msg)) {
        await redis.set(`karin:waves:bind:${e.user_id}`, uid);

        // 返回绑定成功信息.
        return e.reply([
            `绑定特征码成功, \n`,
            `当前仅可查询部分信息, 若想使用完整功能请使用 [~登录] 命令.`
        ], { reply: true });
    }

    // 若特征码不匹配, 则提示用户输入正确的特征码.
    else { return e.reply(`请输入正确的特征码！如: [~绑定100000000]`, { reply: true }); }
}, {
    priority: 1009,
    log: true,
    name: '鸣潮-绑定特征码',
    permission: 'all'
});

/**
 * 用户登录
 * 尝试使用 用户提供的token, 手机号和验证码, 在线登录 三种方式登录.
 * @param {karin.Event} e
 */
const loginReg = /^(?:～|~|∽|#?鸣潮)(?:登录|登陆|登入)(.*)$/;
export const Login = karin.command(loginReg, async (e) => {
    const message = e.msg.match(loginReg)[1];
    let token;

    // 若消息以特征码开头, 则直接使用特征码登录.
    if (/^eyJhbGc/.test(message)) {
        // 若为群聊, 则撤回消息, 防止泄露用户信息.
        if (e.isGroup) { e.bot.RecallMessage(e.contact, e.message_id); }

        token = message;
    }
    
    // 若消息不以特征码开头, 则尝试获取消息中可能存在的手机号和验证码.
    else if (message) {
        // 若为群聊, 则撤回消息, 防止泄露用户信息.
        if (e.isGroup) { e.bot.RecallMessage(e.contact, e.message_id); }

        const [mobile, , code] = message.split(/(:|：)/);
        if (!mobile || !code) {
            return e.reply([
                `请输入正确的手机号与验证码\n`,
                `使用 [~登录帮助] 查看登录方法！`
            ], { reply: true });
        }

        // 使用手机号和验证码获取登录token.
        const data = await waves.getToken(mobile, code);
        if (!data.status) {
            return e.reply([
                `登录失败! 原因: ${data.msg}\n`,
                `使用 [~登录帮助] 查看其他登录方法! `
            ], { reply: true });
        }
        token = data.data.token;
    }
    
    // 若消息为空, 则尝试使用在线登录.
    else {
        // 若登录功能被禁用, 则提示用户联系主人开启或使用其他登录方式.
        if (!cfg.Config.loginServer.allow_login) {
            return e.reply([
                '当前网页登录功能已被禁用, 请联系主人开启或使用其他登录方式进行登录\n',
                '使用 [~登录帮助] 查看其他登录方法! '
            ], { reply: true });
        }

        // 生成随机识别码, 并存储用户ID.
        const id = Math.random().toString(36).substring(2, 12);
        Server.data[id] = { user_id: e.user_id };

        // 构造登录地址, 并提示用户复制到浏览器打开.
        e.reply([
            `请复制登录地址到浏览器打开: \n`,
            `${cfg.Config.loginServer.public_link}/login/${id}\n`,
            `您的识别码为【${e.user_id}】\n`,
            `登录地址有效期为: ${cfg.Config.loginServer.timeout} 秒.`
        ], { reply: true });

        // 设置超时时间, 若超时则删除数据.
        const timeout = Date.now() + cfg.Config.loginServer.timeout * 1000;
        while (!Server.data[id].token && Date.now() < timeout) {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        if (!Server.data[id].token) {
            delete Server.data[id];
            return e.reply('在线登录超时, 请重新登录', { reply: true });
        }

        token = Server.data[id].token;
        delete Server.data[id];
    }

    // 尝试获取用户游戏数据.
    const gameData = await waves.getGameData(token);

    // 若登录失败, 则提示用户登录失败原因.
    if (!gameData.status) {
        return e.reply([
            `登录失败! 原因: ${gameData.msg}\n`,
            `使用 [~登录帮助] 查看其他登录方法! `
        ], { reply: true });
    }

    // 保存用户登录信息.
    const userConfig = cfg.getUserData(e.user_id);
    const data = {
        token,
        userId: gameData.data.userId,
        serverId: gameData.data.serverId,
        roleId: gameData.data.roleId
    };

    // 若用户已登录, 则更新用户信息, 否则添加用户信息.
    const userIndex = userConfig.findIndex(item => item.userId === gameData.data.userId);
    userIndex !== -1 ? (userConfig[userIndex] = data) : userConfig.push(data);

    await redis.set(`karin:waves:bind:${e.user_id}`, gameData.data.roleId);
    cfg.setUserData(e.user_id, userConfig);

    // 返回登录成功信息.
    return e.reply(`${gameData.data.roleName}(${gameData.data.roleId}) 登录成功!`, { reply: true });
}, {
    priority: 1009,
    log: true,
    name: '鸣潮-用户登录',
    permission: 'all'
});

/**
 * 用户解除登录
 * 尝试解除用户登录的特征码.
 * @param {karin.Event} e
 */
const unloginReg = /^(?:～|~|∽|#?鸣潮)(?:删除登录|解除登录|解绑)(.*)$/;
export const UnLogin = karin.command(unloginReg, async (e) => {
    // 获取用户登录的账号列表.
    const accountList = JSON.parse(await redis.get(`karin:waves:users:${e.user_id}`)) || cfg.getUserData(e.user_id) || [];

    // 若账号列表为空, 则提示用户当前没有登录任何账号.
    if (!accountList.length) {
        return e.reply('当前没有登录任何账号, 请使用 [~登录] 进行登录', { reply: true });
    }

    // 匹配用户提供的特征码.
    const roleId = e.msg.match(unloginReg)[1];

    // 若未提供特征码, 或者提供的特征码不在列表中, 则提示提示用户当前登录的特征码.
    if (!roleId || !accountList.map(item => item.roleId).includes(roleId)) {
        const msg = [
            '当前登录的特征码有: \n',
            ...accountList.map((item, index) => `    ${index + 1}. ${item.roleId}\n`),
            `请使用 [~解除登录 + 特征码] 的格式进行解绑,\n`,
            `如: [~解除登录 100000000] .`
        ];
        return e.reply(msg, { reply: true });
    }
    
    // 若特征码存在, 则查找特征码对应的索引, 并删除.
    else {
        // 查找特征码对应的索引, 并删除.
        const index = accountList.findIndex(item => item.roleId === roleId);
        accountList.splice(index, 1);

        // 保存数据.
        cfg.setUserData(e.user_id, accountList);

        return e.reply(`已删除账号 ${roleId}`, { reply: true });
    }
}, {
    priority: 1009,
    log: true,
    name: '鸣潮-解除登录',
    permission: 'all'
});

/**
 * 获取用户登录信息
 * 尝试获取用户登录的账号信息.
 * @param {karin.Event} e
 */
const getTokenReg = /^(?:～|~|∽|#?鸣潮)(我的|库街区)(to?k(en)|登录信息)?$/i;
export const GetToken = karin.command(getTokenReg, async (e) => {
    // 若为群聊, 则提示用户私聊使用该指令.
    if (e.isGroup) {
        return e.reply('为了您的账号安全, 请私聊使用该指令', { reply: true });
    }

    // 获取用户登录的账号列表.
    const accountList = JSON.parse(await redis.get(`karin:waves:users:${e.user_id}`)) || await Cfg.Config.getUserData(e.user_id) || [];

    // 若账号列表为空, 则提示用户当前没有登录任何账号.
    if (!accountList.length) {
        return e.reply('当前没有登录任何账号, 请使用 [~登录] 进行登录', { reply: true });
    }

    // 构造返回信息.
    const tokenList = accountList.map((item,index) => [
        segment.text(`第${index + 1}个账号: ${item.roleId}\n`),
        segment.text(item.token)
    ]);

    // 返回信息.
    return e.reply(tokenList, { reply: true });
}, {
    priority: 1009,
    log: true,
    name: '鸣潮-获取登录信息',
    permission: 'all'
});