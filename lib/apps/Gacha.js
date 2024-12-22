import fs from 'fs';
import { join } from 'path';
import { lodash } from 'node-karin';
import cfg from '../utils/config.js';
import wiki from '../components/Wiki.js';
import waves from '../components/Code.js';
import Render from '../components/render.js';
import { dataPath, basename } from '../utils/dir.js';
import { karin, logger, segment, redis } from 'node-karin';

// 定义匹配抽卡链接的正则.
const gachaUrlReg = 'https:\\/\\/aki-gm-resources\\.aki-game\\.com\\/aki\\/gacha\\/index\\.html';
// 定义匹配抽卡json的正则.
const gachaJsonReg = /\{(?:[^{}]|['"](\\.|[^'\\])*['"])*\}/;
// 合并正则.
const gachaLinkReg = new RegExp(`(${gachaUrlReg})|(${gachaJsonReg.source})`, 'g');

// 定义抽卡数据文件路径.
const gachaDir = join(dataPath, 'GachaData');

// 常驻角色.
const resident = ["鉴心", "卡卡罗", "安可", "维里奈", "凌阳"];

/**
 * 抽卡 链接/json 处理
 * @param {karin.Event} e
 */
export const GachaLink = karin.command(gachaLinkReg, async (e) => {
    // 检查匹配的是否为链接.
    const isUrl = e.msg.match(/https?:\/\/[^\s/$.?#].[^\s]*/g);

    // 定义参数.
    const params = {};

    // 若匹配到链接, 则取出链接.
    if (isUrl) {
        // 取出链接参数, 如果有多个链接参数, 取第一个.
        const urlParams = new URL(isUrl[0].replace('#', '')).searchParams;

        // 取出参数.
        params.playerId = urlParams.get('player_id');
        params.recordId = urlParams.get('record_id');
        params.serverId = urlParams.get('svr_id') || '76402e5b20be2c39f095a152090afddc';
        params.languageCode = 'zh-Hans';
    }
    // 若匹配到json, 则取出json.
    else {
        // 取出json参数, 如果有多个json参数, 取第一个.
        const match = e.msg.match(gachaJsonReg)[0].replace(/'/g, '"');
        let jsonParams = {};
        try {
            jsonParams = JSON.parse(match);
        } catch (error) { logger.error(logger.blue(`[${basename}]`), `[GachaLink] JSON解析失败, ${error}`); }

        // 取出参数.
        params.playerId = jsonParams.playerId || jsonParams.player_id;
        params.recordId = jsonParams.recordId || jsonParams.record_id;
        params.serverId = jsonParams.serverId || jsonParams.svr_id || '76402e5b20be2c39f095a152090afddc';
        params.languageCode = jsonParams.languageCode || jsonParams.lang || 'zh-Hans';
    }

    // 检查参数是否完整.
    if (!params.playerId || !params.recordId) {
        return logger.error(logger.blue(`[${basename}]`), `[GachaLink] 参数不完整, 缺少playerId或recordId.`) && false;
    }
    else { return await gachaData(e, { user: e.user_id, param: params, isHistory: false }); }
}, {
    priority: 1009,
    log: true,
    name: '鸣潮-抽卡链接',
    permissions: 'all',
});

/**
 * 抽卡记录查询
 * @param {karin.Event} e
 */
const gachaReg = /^(～|~|∽|#?鸣潮)(常驻)?(全部|角色|武器|自选|新手)?(抽卡|记录|统计|分析){1,4}$/;
export const Gacha = karin.command(gachaReg, async (e) => {
    const user = e.at.shift() || e.user_id;

    /**
  * 获取抽卡索引
  * @param {boolean} isResident 是否为常驻池
  * @param {string} pool 卡池名称
  * @returns {number} 0-6
  */
    const getPoolIndex = (isResident, pool) => {
        switch (pool) {
            case '角色': return isResident ? 3 : 1;
            case '武器': return isResident ? 4 : 2;
            case '新手': return 5;
            case '自选': return 6;
            case '全部':
            default:
                return 0;
        }
    };

    // 匹配消息, 获取参数.
    const match = e.msg.match(gachaReg);
    const isResident = match[2];
    const pool = match[3] || '全部';

    return await gachaData(e, { user, poolIndex: getPoolIndex(isResident, pool), isHistory: true });
}, {
    priority: 1009,
    log: true,
    name: '鸣潮-抽卡记录',
    permissions: 'all',
});

/**
 * 导入抽卡记录
 * @param {karin.Event} e
 */
const gachaImportReg = /^(～|~|∽|#?鸣潮)导入(抽卡|记录){1,2}$/;
export const GachaImport = karin.command(gachaImportReg, async (e) => {
    // TODO: 导入抽卡记录.
    return e.reply('该功能暂未开放.');
}, {
    priority: 1009,
    log: true,
    name: '鸣潮-导入抽卡记录',
    permissions: 'all',
});

/**
 * 导出抽卡记录
 * @param {karin.Event} e
 */
const gachaExportReg = /^(～|~|∽|#?鸣潮)导出(抽卡|记录){1,2}$/;
export const GachaExport = karin.command(gachaExportReg, async (e) => {
    // TODO: 导出抽卡记录.
    return e.reply('该功能暂未开放.');
}, {
    priority: 1009,
    log: true,
    name: '鸣潮-导出抽卡记录',
    permissions: 'all',
});

/**
 * 获取抽卡数据
 * @param {karin.Event} e 
 * @param {object} params { param: { playerId, recordId, serverId, languageCode }, poolIndex, isHistory }
 */
async function gachaData (e, params = {
    user: e.user_id,
    param: {},
    poolIndex: 0,
    isHistory: false
}) {
    // 定义渲染数据.
    let renderData = {};

    // 定义卡池索引.
    const poolKey = {
        1: 'upCharPool',
        2: 'upWpnPool',
        3: 'stdCharPool',
        4: 'stdWpnPool',
        5: 'otherPool',
        6: 'upCharPool',
    };

    // 是否为历史记录.
    if (params.isHistory) {
        // 尝试读取历史记录.
        const boundId = await redis.get(`karin:waves:getHistory:${params.user}`);
        const filePath = join(gachaDir, `${boundId}_Export.json`);

        // 检查文件是否存在.
        if (boundId && fs.existsSync(filePath)) {
            // 读取并解析文件.
            const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

            e.reply([
                `正在获取 [UID: ${data.info.uid}] 于 ${new Date(data.info.export_timestamp).toLocaleString()} 的抽卡记录，请稍候...`,
                `\n请注意, 该数据不会主动更新, 如需更新, 请发送 [~抽卡帮助] 依照提示操作.`,
            ]);

            /**
      * 通过卡池索引获取数据
      * @param {number}} poolIndex 1-6
      * @returns 
      */
            const getPoolData = async (poolIndex) =>
                dataFormat(convertData(data.list.filter(item => item.gacha_id === poolIndex), false));

            // 定义渲染数据.
            renderData = { playerId: data.info.uid };

            // 若索引为0, 则获取 4 个卡池数据.
            if (!params.poolIndex) {
                const pickPool = ['upCharPool', 'upWpnPool', 'stdCharPool', 'stdWpnPool'];
                for (const [i, key] of pickPool.entries()) {
                    renderData[key] = await getPoolData(i + 1);
                }
            }
            // 否则获取指定卡池数据.
            else {
                const key = poolKey[params.poolIndex];
                renderData[key] = await getPoolData(params.poolIndex);
            }
        }
        else {
            return e.reply([
                params.user === e.user_id ? '' : segment.at(params.user),
                params.user === e.user_id
                    ? `暂无抽卡记录, 请使用 [~抽卡帮助] ,按照提示获取并发送抽卡链接.`
                    : `\n暂无抽卡记录`,
            ], { reply: true });
        }
    }
    // 非历史记录.
    else if (!params.isHistory && lodash.isEmpty(params.param)) {
        return logger.error(logger.blue(`[${basename}]`), '[GachaData] 参数不完整, 缺少param.') && false;
    }
    else {
        // 异步获取卡池数据.
        const pools = await Promise.all(Array.from({ length: 7 }, async (_, i) => {
            const poolId = i + 1;
            return await waves.getGaCha({ ...params.param, cardPoolId: poolId, cardPoolType: poolId });
        }));

        // 检查数据是否获取成功, 若有失败的数据, 则返回错误信息.
        if (pools.find(pool => !pool.status)) { return e.reply(`抽卡数据获取失败, ${pools.find(pool => !pool.status).msg}`) && false; }

        // 定义渲染数据.
        renderData = { playerId: params.param.playerId };

        // 若索引为0, 则获取 4 个卡池数据.
        if (!params.poolIndex) {
            const pool = ['upCharPool', 'upWpnPool', 'stdCharPool', 'stdWpnPool'];
            for (const [i, key] of pool.entries()) {
                renderData[key] = await dataFormat(pools[i].data);
            }
        }
        // 否则获取指定卡池数据.
        else {
            const key = poolKey[params.poolIndex];
            renderData[key] = await dataFormat(pools[params.poolIndex - 1].data);
        }

        // 保存redis记录.
        await redis.set(`karin:waves:getHistory:${params.user}`, renderData.playerId);

        // 定义保存的数据.
        const json = {
            info: {
                lang: 'zh-cn',
                region_time_zone: 8,
                export_timestamp: Date.now(),
                export_app: basename,
                export_app_version: cfg.package.version,
                wwgf_version: 'v0.1b',
                uid: renderData.playerId,
            },
            list: convertData(pools.map(pool => pool.data).flat(), true),
        };

        // 保存数据.
        const savePath = join(gachaDir, `${renderData.playerId}_Export.json`);
        if (fs.existsSync(savePath)) {
            const { list } = JSON.parse(fs.readFileSync(savePath, 'utf-8'));

            const filteredList = Object.values(list.reduce((acc, item) => {
                (acc[item.gacha_id] = acc[item.gacha_id] || []).push(item);
                return acc;
            }, {})).filter(group => group.some(item => json.list.some(newItem => newItem.id === item.id)))
                .flat();

            json.list = [...json.list, ...filteredList].filter((item, index, self) => index === self.findIndex(t => t.id === item.id));

            json.list.sort((a, b) => a.gacha_id - b.gacha_id || b.id - a.id);
        }

        fs.writeFileSync(savePath, JSON.stringify(json, null, 2));
        logger.info(logger.blue(basename), logger.cyan(`已将抽卡记录写入本地文件:`), logger.green(`${renderData.playerId}_Export.json`));
    }

    // 渲染数据, 并发送消息.
    return e.reply(await Render.render('Template/gacha/gacha', { data: renderData }), { reply: true });
}

/**
 * 格式化抽卡数据
 * @param {array} array 
 * @returns {Promise<object>}
 */
async function dataFormat (array) {
    const no5Star = ((idx => (idx === -1 ? array.length : idx))(array.findIndex(item => item.qualityLevel === 5)));
    const no4Star = ((idx => (idx === -1 ? array.length : idx))(array.findIndex(item => item.qualityLevel === 4)));
    const fiveStar = array.filter(item => item.qualityLevel === 5).length;
    const fourStar = array.filter(item => item.qualityLevel === 4).length;
    const std5Star = array.filter(item => item.qualityLevel === 5 && resident.includes(item.name)).length;
    const fourStarWpn = array.filter(item => item.qualityLevel === 4 && item.resourceType === "武器").length;
    const max4Star = Object.entries(array.filter(item => item.qualityLevel === 4).reduce((acc, item) => (acc[item.name] = (acc[item.name] || 0) + 1, acc), {})).reduce((max, curr) => curr[1] > max[1] ? curr : max, ['无', 0])[0];
    const avg5Star = (fiveStar !== 0) ? Math.round((array.length - no5Star) / fiveStar) : 0;
    const avg4Star = (fourStar !== 0) ? Math.round((array.length - no4Star) / fourStar) : 0;
    const avgUP = (fiveStar - std5Star !== 0) ? Math.round((array.length - no5Star) / (fiveStar - std5Star)) : 0;
    const minPit = ((fiveStar, std5Star) => (fiveStar === std5Star ? 0.0 : ((fiveStar - std5Star * 2) / (fiveStar - std5Star) * 100).toFixed(1)))((resident.includes(array.filter(item => item.qualityLevel === 5)[0]?.name) ? 1 : 0) + fiveStar, std5Star);
    const upCost = (avgUP * 160 / 10000).toFixed(2);
    const worstLuck = Math.max(...(array.map((item, index) => item.qualityLevel === 5 ? index : -1).filter(index => index !== -1).reduce((gaps, curr, i, arr) => (i > 0 ? [...gaps, curr - arr[i - 1]] : gaps), [])), array.length - (array.map((item, index) => item.qualityLevel === 5 ? index : -1).filter(index => index !== -1).slice(-1)[0] + 1)) || 0;
    const bestLuck = Math.min(...(array.map((item, index) => item.qualityLevel === 5 ? index : -1).filter(index => index !== -1).reduce((gaps, curr, i, arr) => (i > 0 ? [...gaps, curr - arr[i - 1]] : gaps), [])), array.length - (array.map((item, index) => item.qualityLevel === 5 ? index : -1).filter(index => index !== -1).slice(-1)[0] + 1)) || 0;

    const pool = await Promise.all(array.filter(item => item.qualityLevel === 5).map(async (item) => ({ name: item.name, times: (array.slice(array.indexOf(item) + 1).findIndex(x => x.qualityLevel === 5) + 1) || (array.length - array.indexOf(item)), isUp: !resident.includes(item.name), avatar: (await wiki.getRecord(item.name)).record.content.contentUrl })));

    return {
        info: {
            total: array.length,
            time: array.length > 0 ? [array[0].time, array[array.length - 1].time] : [null, null],
            no5Star: no5Star,
            no4Star: no4Star,
            fiveStar: fiveStar,
            fourStar: fourStar,
            std5Star: std5Star,
            fourStarWpn: fourStarWpn,
            max4Star: max4Star,
            avg5Star: avg5Star,
            avg4Star: avg4Star,
            avgUP: avgUP,
            minPit: minPit,
            upCost: upCost,
            worstLuck: worstLuck,
            bestLuck: bestLuck,
        },
        pool: pool
    };
}

/**
 * WWGF 的抽卡数据格式转换
 * @param {array} dataArray 数组数据
 * @param {boolean} toWWGF 是否转换为 WWGF 格式
 * @returns {array}
 */
function convertData (dataArray, toWWGF) {
    const mappings = {
        forward: {
            gacha: {
                "角色精准调谐": "0001",
                "武器精准调谐": "0002",
                "角色调谐（常驻池）": "0003",
                "武器调谐（常驻池）": "0004",
                "新手调谐": "0005",
                "6": "0006",
                "7": "0007"
            },
            type: {
                "0001": "角色活动唤取",
                "0002": "武器活动唤取",
                "0003": "角色常驻唤取",
                "0004": "武器常驻唤取",
                "0005": "新手唤取",
                "0006": "新手自选唤取",
                "0007": "新手自选唤取（感恩定向唤取）"
            }
        },
        reverse: {
            "0001": "角色精准调谐",
            "0002": "武器精准调谐",
            "0003": "角色调谐（常驻池）",
            "0004": "武器调谐（常驻池）",
            "0005": "新手调谐",
            "0006": "新手自选唤取",
            "0007": "新手自选唤取（感恩定向唤取）"
        }
    };

    const generateId = (ts, poolId, drawNum) => `${String(ts).padStart(10, '0')}${String(poolId).padStart(4, '0')}000${String(drawNum).padStart(2, '0')}`;

    const timestampCount = {};

    return dataArray.map(item => {
        const ts = Math.floor(new Date(item.time).getTime() / 1000);
        if (toWWGF) {
            const poolId = mappings.forward.gacha[item.cardPoolType];

            timestampCount[ts] = timestampCount[ts] || Math.min(dataArray.filter(record =>
                Math.floor(new Date(record.time).getTime() / 1000) === ts
            ).length, 10);

            const drawNum = timestampCount[ts]--;
            const uniqueId = generateId(ts, poolId, drawNum);

            return {
                gacha_id: poolId,
                gacha_type: mappings.forward.type[poolId],
                item_id: String(item.resourceId),
                count: String(item.count),
                time: item.time,
                name: item.name,
                item_type: item.resourceType,
                rank_type: String(item.qualityLevel),
                id: uniqueId
            };
        } else {
            return {
                cardPoolType: mappings.reverse[item.gacha_id],
                resourceId: Number(item.item_id),
                qualityLevel: Number(item.rank_type),
                resourceType: item.item_type,
                name: item.name,
                count: Number(item.count),
                time: item.time
            };
        }
    });
}