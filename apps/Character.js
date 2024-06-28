import plugin from '../../../lib/plugins/plugin.js'
import Waves from "../components/Code.js";
import TapTap from '../components/Taptap.js';
import Config from "../components/Config.js";
import Wiki from '../components/Wiki.js';
import Render from '../model/render.js';

export class Character extends plugin {
    constructor() {
        super({
            name: "鸣潮-角色面板",
            event: "message",
            priority: 1009,
            rule: [
                {
                    reg: "^(～|~|鸣潮).*面板(\\d{9})?$",
                    fnc: "character"
                }
            ]
        })
    }

    async character(e) {
        if (e.at) e.user_id = e.at;
        let accountList = JSON.parse(await redis.get(`Yunzai:waves:users:${e.user_id}`)) || await Config.getUserConfig(e.user_id);
        const waves = new Waves();

        const match = e.msg.match(/\d{9}$/);

        if (!accountList.length) {
            if (match || await redis.get(`Yunzai:waves:bind:${e.user_id}`)) {
                let publicCookie = await waves.getPublicCookie();
                if (!publicCookie) {
                    return await e.reply('当前没有可用的公共Cookie，请使用[~登录]进行绑定');
                } else {
                    if (match) {
                        publicCookie.roleId = match[0];
                        await redis.set(`Yunzai:waves:bind:${e.user_id}`, publicCookie.roleId);
                    } else if (await redis.get(`Yunzai:waves:bind:${e.user_id}`)) {
                        publicCookie.roleId = await redis.get(`Yunzai:waves:bind:${e.user_id}`);
                    }
                    accountList.push(publicCookie);
                }
            } else {
                return await e.reply('当前没有绑定任何账号，请使用[~登录]进行绑定');
            }
        }

        const matchName = e.msg.match(/(～|~|鸣潮)?(.*?)面板/);
        if (!matchName || !matchName[2]) {
            return false
        }

        const message = matchName[2];

        const wiki = new Wiki();
        const name = await wiki.getAlias(message);

        let data = [];
        let deleteroleId = [];

        const usability = await waves.isAvailable(accountList[0].token);

        if (!usability) {
            data.push({ message: `账号 ${accountList[0].roleId} 的Token已失效\n请重新绑定Token` });
            deleteroleId.push(accountList[0].roleId);
        }

        if (match) {
            accountList[0].roleId = match[0];
            await redis.set(`Yunzai:waves:bind:${e.user_id}`, accountList[0].roleId);
        }

        const roleDataList = await waves.getRoleData(accountList[0].serverId, accountList[0].roleId, accountList[0].token);

        let charId;

        roleDataList.data.roleList.forEach(role => {
            if (role.roleName === name) charId = role.roleId;
        })

        if (!charId) {
            e.reply(`该账号没有角色${name}`);
            return;
        }

        const tapId = Config.getTapTable()[accountList[0].roleId];
        let tapRoleData, roleData;
        roleData = await waves.getRoleDetail(accountList[0].serverId, accountList[0].roleId, charId, accountList[0].token);
        if (tapId) {
            const taptap = new TapTap(tapId);
            let result = await taptap.getCharInfo(name);
            if (result.status) tapRoleData = result.msg
        }

        const imageCard = await Render.charProfile({
            uid: accountList[0].roleId,
            roleData,
            tapRoleData
        })

        if (deleteroleId.length) {
            let newAccountList = accountList.filter(account => !deleteroleId.includes(account.roleId));
            Config.setUserConfig(e.user_id, newAccountList);
        }

        if (data.length === 1) {
            await e.reply(data[0].message);
            return true;
        }

        await e.reply(imageCard);
        return true;
    }
}