import qs from 'qs';
import axios from 'axios';
import config from '../utils/config.js';
import { basename } from '../utils/dir.js';
import { logger, redis } from 'node-karin';

const CONSTANTS = {
    LOGIN_URL: 'https://api.kurobbs.com/user/sdkLoginForH5', // 手机号验证码登录接口.
    REFRESH_URL: 'https://api.kurobbs.com/aki/roleBox/akiBox/refreshData', // 刷新账号资料接口.
    GAME_DATA_URL: 'https://api.kurobbs.com/gamer/widget/game3/refresh', // 体力数据接口.
    BASE_DATA_URL: 'https://api.kurobbs.com/aki/roleBox/akiBox/baseData', // 探索数据接口.
    ROLE_DATA_URL: 'https://api.kurobbs.com/aki/roleBox/akiBox/roleData', // 角色列表接口.
    CALABASH_DATA_URL: 'https://api.kurobbs.com/aki/roleBox/akiBox/calabashData', // 数据坞详情接口.
    CHALLENGE_DATA_URL: 'https://api.kurobbs.com/aki/roleBox/akiBox/challengeDetails', // 全息战略详情接口.
    EXPLORE_DATA_URL: 'https://api.kurobbs.com/aki/roleBox/akiBox/exploreIndex', // 探索详情接口.
    gameSignUrl: 'https://api.kurobbs.com/encourage/signIn/v2', // 游戏签到接口.
    QUERY_RECORD_URL: 'https://api.kurobbs.com/encourage/signIn/queryRecordV2', // 签到领取记录接口.
    GACHA_URL: 'https://gmserver-api.aki-game2.com/gacha/record/query', // 抽卡记录接口.
    INTL_GACHA_URL: 'https://gmserver-api.aki-game2.net/gacha/record/query', // 国际服抽卡记录接口.
    ROLE_DETAIL_URL: 'https://api.kurobbs.com/aki/roleBox/akiBox/getRoleDetail', // 角色详细信息接口.
    EVENT_LIST_URL: 'https://api.kurobbs.com/forum/companyEvent/findEventList', // 活动列表接口.
    SELF_TOWER_DATA_URL: 'https://api.kurobbs.com/aki/roleBox/akiBox/towerDataDetail', // 逆境深塔数据接口.
    OTHER_TOWER_DATA_URL: 'https://api.kurobbs.com/aki/roleBox/akiBox/towerIndex', // 逆境深塔数据接口.

    // 库街区相关接口.
    bbsSignUrl: 'https://api.kurobbs.com/user/signIn', // 库街区签到接口
    LIKE_URL: 'https://api.kurobbs.com/forum/like', // 库街区文章点赞接口
    SHARE_URL: 'https://api.kurobbs.com/encourage/level/shareTask', // 库街区文章分享接口
    DETAIL_URL: 'https://api.kurobbs.com/forum/getPostDetail', // 库街区浏览帖子(获取帖子详情)接口
    TASK_PROCESS_URL: 'https://api.kurobbs.com/encourage/level/getTaskProcess', // 库街区获取任务进度接口
    GET_COIN_URL: 'https://api.kurobbs.com/encourage/gold/getTotalGold', // 库街区获取库洛币总数接口
    FORUM_LIST: 'https://api.kurobbs.com/forum/list', // 库街区获取帖子列表接口

    // 公用请求头.
    REQUEST_HEADERS_BASE: { "source": "h5" },
};

class Waves {
    constructor() { }

    /**
     * 手机号+验证码登录.
     * @param {string} mobile 手机号码.
     * @param {string} code 验证码.
     * @returns {object} {status: 登录状态, data?: object msg?: 错误信息}
     */
    async getToken(mobile, code) {
        const devCode = [...Array(40)].map(() => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'[(Math.random() * 36) | 0]).join('');

        const data = qs.stringify({
            mobile,
            code,
        });

        try {
            const response = await axios.post(CONSTANTS.LOGIN_URL, data, { headers: { ...CONSTANTS.REQUEST_HEADERS_BASE, devCode } });

            if (response.data.code === 200) {
                if (config.Config.public.enable_log) {
                    logger.mark(logger.blue(`[${basename}]`), logger.green(`验证码登录成功，库街区用户：${response.data.data.userName}`));
                }
                return { status: true, data: response.data.data };
            } else {
                logger.mark(logger.blue(`[${basename}]`), logger.red(`验证码登录失败：${response.data.msg}`));
                return { status: false, msg: response.data.msg };
            }
        } catch (error) {
            logger.mark(logger.blue(`[${basename}]`), logger.red(`验证码登录失败，疑似网络问题：\n${error}`));
            return { status: false, msg: '登录失败，疑似网络问题，请检查控制台日志' };
        }
    }

    /**
     * 检查token是否可用.
     * @param {string} token token.
     * @param {boolean} strict 严格判断, 为 true 时异常时返回 false, 否则返回 true.
     * @returns {Promise<boolean>} 是否可用.
     */
    async isAvailable(token, strict = false) {
        const data = qs.stringify({
            'type': '2',
            'sizeType': '1'
        });


        try {
            const response = await axios.post(CONSTANTS.GAME_DATA_URL, data, { headers: { ...CONSTANTS.REQUEST_HEADERS_BASE, 'token': token } });

            if (response.data.code === 220) {
                logger.mark(logger.blue(`[${basename}]`), logger.yellow(`获取可用性成功：账号已过期`));
                return false;
            } else {
                if (config.Config.public.enable_log) {
                    logger.mark(logger.blue(`[${basename}]`), logger.green(`获取可用性成功：账号可用`));
                }
                return true;
            }
        } catch (error) {
            logger.mark(logger.blue(`[${basename}]`), logger.red(`获取可用性失败，疑似网络问题：\n${error}`));
            return !strict;
        }
    }

    /**
     * 刷新账号资料.
     * @param {string} serverId 服务器ID.
     * @param {string} roleId 游戏uid.
     * @param {string} token 库街区token.
     * @returns {object} {status: 获取状态, data?: object msg?: 错误信息}
     */
    async refreshData(serverId, roleId, token) {
        const data = qs.stringify({
            'gameId': 3,
            'serverId': serverId,
            'roleId': roleId
        });

        try {
            const response = await axios.post(CONSTANTS.REFRESH_URL, data, { headers: { ...CONSTANTS.REQUEST_HEADERS_BASE, 'token': token } });

            if (response.data.code === 200) {
                if (config.Config.public.enable_log) {
                    logger.mark(logger.blue(`[${basename}]`), logger.green(`刷新资料成功`));
                }
                return { status: true, data: response.data.data };
            } else {
                logger.mark(logger.blue(`[${basename}]`), logger.red(`刷新资料失败：${response.data.msg}`));
                return { status: false, msg: response.data.msg };
            }
        } catch (error) {
            logger.mark(logger.blue(`[${basename}]`), logger.red(`刷新资料失败，疑似网络问题：\n${error}`));
            return { status: false, msg: '刷新资料失败，疑似网络问题，请检查控制台日志' };
        }
    }

    /**
     * 体力数据.
     * @param {string} token token.
     * @returns {object} {status: 获取状态, data?: object msg?: 错误信息}
     */
    async getGameData(token) {
        const data = qs.stringify({
            'type': '2',
            'sizeType': '1'
        });


        try {
            const response = await axios.post(CONSTANTS.GAME_DATA_URL, data, { headers: { ...CONSTANTS.REQUEST_HEADERS_BASE, 'token': token } });

            if (response.data.code === 200) {
                if (response.data.data === null) {
                    logger.mark(logger.blue(`[${basename}]`), logger.yellow(`获取日常数据失败，返回空数据`));
                    return { status: false, msg: "查询信息失败，请检查库街区数据终端中对应板块的对外展示开关是否打开" };
                }
                if (config.Config.public.enable_log) {
                    logger.mark(logger.blue(`[${basename}]`), logger.green(`获取日常数据成功`));
                }
                return { status: true, data: response.data.data };
            } else {
                logger.mark(logger.blue(`[${basename}]`), logger.red(`获取日常数据失败：${response.data.msg}`));
                return { status: false, msg: response.data.msg };
            }
        } catch (error) {
            logger.mark(logger.blue(`[${basename}]`), logger.red(`获取日常数据失败，疑似网络问题：\n${error}`));
            return { status: false, msg: '获取日常数据失败，疑似网络问题，请检查控制台日志' };
        }
    }

    /**
     * 探索数据.
     * @param {string} serverId 服务器ID.
     * @param {string} roleId 游戏uid.
     * @param {string} token 库街区token.
     * @returns {object} {status: 获取状态, data?: object msg?: 错误信息}
     */
    async getBaseData(serverId, roleId, token) {
        await this.refreshData(serverId, roleId, token);

        const data = qs.stringify({
            'gameId': 3,
            'serverId': serverId,
            'roleId': roleId
        });

        try {
            const response = await axios.post(CONSTANTS.BASE_DATA_URL, data, { headers: { ...CONSTANTS.REQUEST_HEADERS_BASE, 'token': token } });

            if (response.data.code === 200) {
                response.data.data = JSON.parse(response.data.data);
                if (response.data.data === null || !response.data.data.showToGuest) {
                    logger.mark(logger.blue(`[${basename}]`), logger.yellow(`获取我的资料失败，返回空数据`));
                    return { status: false, msg: "查询信息失败，请检查库街区数据终端中对应板块的对外展示开关是否打开" };
                }
                if (config.Config.public.enable_log) {
                    logger.mark(logger.blue(`[${basename}]`), logger.green(`获取我的资料成功`));
                }
                return { status: true, data: response.data.data };
            } else {
                logger.mark(logger.blue(`[${basename}]`), logger.red(`获取我的资料失败：${response.data.msg}`));
                return { status: false, msg: response.data.msg };
            }
        } catch (error) {
            logger.mark(logger.blue(`[${basename}]`), logger.red(`获取我的资料失败，疑似网络问题：\n${error}`));
            return { status: false, msg: '获取我的资料失败，疑似网络问题，请检查控制台日志' };
        }
    }

    /**
     * 角色列表.
     * @param {string} serverId 服务器ID.
     * @param {string} roleId 游戏uid.
     * @param {string} token 库街区token.
     * @returns {object} {status: 获取状态, data?: object msg?: 错误信息}
     */
    async getRoleData(serverId, roleId, token) {
        await this.refreshData(serverId, roleId, token);

        const data = qs.stringify({
            'gameId': 3,
            'serverId': serverId,
            'roleId': roleId
        });

        try {
            const response = await axios.post(CONSTANTS.ROLE_DATA_URL, data, { headers: { ...CONSTANTS.REQUEST_HEADERS_BASE, 'token': token } });

            if (response.data.code === 200) {
                response.data.data = JSON.parse(response.data.data);
                if (response.data.data === null || !response.data.data.showToGuest) {
                    logger.mark(logger.blue(`[${basename}]`), logger.yellow(`获取共鸣者失败，返回空数据`));
                    return { status: false, msg: "查询信息失败，请检查库街区数据终端中对应板块的对外展示开关是否打开" };
                }
                if (config.Config.public.enable_log) {
                    logger.mark(logger.blue(`[${basename}]`), logger.green(`获取共鸣者成功`));
                }
                return { status: true, data: response.data.data };
            } else {
                logger.mark(logger.blue(`[${basename}]`), logger.red(`获取共鸣者失败：${response.data.msg}`));
                return { status: false, msg: response.data.msg };
            }
        } catch (error) {
            logger.mark(logger.blue(`[${basename}]`), logger.red(`获取共鸣者失败，疑似网络问题：\n${error}`));
            return { status: false, msg: '获取共鸣者失败，疑似网络问题，请检查控制台日志' };
        }
    }

    /**
     * 数据坞详情.
     * @param {string} serverId 服务器ID.
     * @param {string} roleId 游戏uid.
     * @param {string} token 库街区token.
     * @returns {object} {status: 获取状态, data?: object msg?: 错误信息}
     */
    async getCalabashData(serverId, roleId, token) {
        await this.refreshData(serverId, roleId, token);

        const data = qs.stringify({
            'gameId': 3,
            'serverId': serverId,
            'roleId': roleId
        });

        try {
            const response = await axios.post(CONSTANTS.CALABASH_DATA_URL, data, { headers: { ...CONSTANTS.REQUEST_HEADERS_BASE, 'token': token } });

            if (response.data.code === 200) {
                response.data.data = JSON.parse(response.data.data);
                if (response.data.data === null) {
                    logger.mark(logger.blue(`[${basename}]`), logger.yellow(`获取数据坞失败，返回空数据`));
                    return { status: false, msg: "查询信息失败，请检查库街区数据终端中对应板块的对外展示开关是否打开" };
                }
                if (config.Config.public.enable_log) {
                    logger.mark(logger.blue(`[${basename}]`), logger.green(`获取数据坞成功`));
                }
                return { status: true, data: response.data.data };
            } else {
                logger.mark(logger.blue(`[${basename}]`), logger.red(`获取数据坞失败：${response.data.msg}`));
                return { status: false, msg: response.data.msg };
            }
        } catch (error) {
            logger.mark(logger.blue(`[${basename}]`), logger.red(`获取数据坞失败，疑似网络问题：\n${error}`));
            return { status: false, msg: '获取数据坞失败，疑似网络问题，请检查控制台日志' };
        }
    }

    /**
     * 全息战略详情.
     * @param {string} serverId 服务器ID.
     * @param {string} roleId 游戏uid.
     * @param {string} token 库街区token.
     * @returns {object} {status: 获取状态, data?: object msg?: 错误信息}
     */
    async getChallengeData(serverId, roleId, token) {
        await this.refreshData(serverId, roleId, token);

        const data = qs.stringify({
            'gameId': 3,
            'serverId': serverId,
            'roleId': roleId,
            'countryCode': 1
        });

        try {
            const response = await axios.post(CONSTANTS.CHALLENGE_DATA_URL, data, { headers: { ...CONSTANTS.REQUEST_HEADERS_BASE, 'token': token } });

            if (response.data.code === 200) {
                response.data.data = JSON.parse(response.data.data);
                if (response.data.data === null || !response.data.data.open) {
                    logger.mark(logger.blue(`[${basename}]`), logger.yellow(`获取挑战数据失败，返回空数据`));
                    return { status: false, msg: "查询信息失败，请检查库街区数据终端中对应板块的对外展示开关是否打开" };
                }
                if (config.Config.public.enable_log) {
                    logger.mark(logger.blue(`[${basename}]`), logger.green(`获取挑战数据成功`));
                }
                return { status: true, data: response.data.data };
            } else {
                logger.mark(logger.blue(`[${basename}]`), logger.red(`获取挑战数据失败：${response.data.msg}`));
                return { status: false, msg: response.data.msg };
            }
        } catch (error) {
            logger.mark(logger.blue(`[${basename}]`), logger.red(`获取挑战数据失败，疑似网络问题：\n${error}`));
            return { status: false, msg: '获取挑战数据失败，疑似网络问题，请检查控制台日志' };
        }
    }

    /**
     * 探索详情.
     * @param {string} serverId 服务器ID.
     * @param {string} roleId 游戏uid.
     * @param {string} token 库街区token.
     * @returns {object} {status: 获取状态, data?: object msg?: 错误信息}
     */
    async getExploreData(serverId, roleId, token) {
        await this.refreshData(serverId, roleId, token);

        const data = qs.stringify({
            'gameId': 3,
            'serverId': serverId,
            'roleId': roleId,
            'countryCode': 1
        });

        try {
            const response = await axios.post(CONSTANTS.EXPLORE_DATA_URL, data, { headers: { ...CONSTANTS.REQUEST_HEADERS_BASE, 'token': token } });

            if (response.data.code === 200) {
                response.data.data = JSON.parse(response.data.data);
                if (response.data.data === null || !response.data.data.open) {
                    logger.mark(logger.blue(`[${basename}]`), logger.yellow(`获取探索数据失败，返回空数据`));
                    return { status: false, msg: "查询信息失败，请检查库街区数据终端中对应板块的对外展示开关是否打开" };
                }
                if (config.Config.public.enable_log) {
                    logger.mark(logger.blue(`[${basename}]`), logger.green(`获取探索数据成功`));
                }
                return { status: true, data: response.data.data };
            } else {
                logger.mark(logger.blue(`[${basename}]`), logger.red(`获取探索数据失败：${response.data.msg}`));
                return { status: false, msg: response.data.msg };
            }
        } catch (error) {
            logger.mark(logger.blue(`[${basename}]`), logger.red(`获取探索数据失败，疑似网络问题：\n${error}`));
            return { status: false, msg: '获取探索数据失败，疑似网络问题，请检查控制台日志' };
        }
    }

    /**
     * 角色详细信息.
     * @param {string} serverId 服务器ID.
     * @param {string} roleId 游戏uid.
     * @param {string} id 角色ID.
     * @param {string} token 库街区token.
     * @returns {object} {status: 获取状态, data?: object msg?: 错误信息}
     */
    async getRoleDetail(serverId, roleId, id, token) {
        await this.refreshData(serverId, roleId, token);

        const data = qs.stringify({
            'serverId': serverId,
            'roleId': roleId,
            'id': id
        });

        try {
            const response = await axios.post(CONSTANTS.ROLE_DETAIL_URL, data, { headers: { ...CONSTANTS.REQUEST_HEADERS_BASE, 'token': token } });

            if (response.data.code === 200) {
                response.data.data = JSON.parse(response.data.data);
                if (response.data.data === null) {
                    logger.mark(logger.blue(`[${basename}]`), logger.yellow(`获取角色详细信息失败，返回空数据`));
                    return { status: false, msg: "查询信息失败，请检查库街区数据终端中对应板块的对外展示开关是否打开" };
                }
                if (config.Config.public.enable_log) {
                    logger.mark(logger.blue(`[${basename}]`), logger.green(`获取角色详细信息成功`));
                }
                return { status: true, data: response.data.data };
            } else {
                logger.mark(logger.blue(`[${basename}]`), logger.red(`获取角色详细信息失败：${response.data.msg}`));
                return { status: false, msg: response.data.msg };
            }
        } catch (error) {
            logger.mark(logger.blue(`[${basename}]`), logger.red(`获取角色详细信息失败，疑似网络问题：\n${error}`));
            return { status: false, msg: '获取角色详细信息失败，疑似网络问题，请检查控制台日志' };
        }

    }

    /**
     * 游戏签到.
     * @param {string} serverId 服务器ID.
     * @param {string} roleId 游戏uid.
     * @param {string} userId 库街区ID.
     * @param {string} token 库街区token.
     * @returns {object} {status: 获取状态, data?: object msg?: 错误信息}
     */
    async gameSignIn(serverId, roleId, userId, token) {
        await this.refreshData(serverId, roleId, token);

        const data = qs.stringify({
            'gameId': 3,
            'serverId': serverId,
            'roleId': roleId,
            'userId': userId,
            'reqMonth': (new Date().getMonth() + 1).toString().padStart(2, '0'),
        });

        try {
            const response = await axios.post(CONSTANTS.gameSignUrl, data, { headers: { ...CONSTANTS.REQUEST_HEADERS_BASE, 'token': token, devcode: '' } });

            if (response.data.code === 200) {
                if (response.data.data === null) {
                    logger.mark(logger.blue(`[${basename}]`), logger.yellow(`签到失败，返回空数据`));
                    return { status: false, msg: "查询信息失败，请检查库街区数据终端中对应板块的对外展示开关是否打开" };
                }
                if (config.Config.public.enable_log) {
                    logger.mark(logger.blue(`[${basename}]`), logger.green(`${roleId} 签到成功`));
                }
                return { status: true, data: response.data.data };
            } else {
                logger.mark(logger.blue(`[${basename}]`), logger.red(`${roleId} 签到失败：${response.data.msg}`));
                return { status: false, msg: response.data.msg };
            }
        } catch (error) {
            logger.mark(logger.blue(`[${basename}]`), logger.red(`签到失败，疑似网络问题：\n${error}`));
            return { status: false, msg: '签到失败，疑似网络问题，请检查控制台日志' };
        }
    }

    /**
     * 游戏签到领取记录.
     * @param {string} serverId 服务器ID.
     * @param {string} roleId 游戏uid.
     * @param {string} token 库街区token.
     * @returns {object} {status: 获取状态, data?: object msg?: 错误信息}
     */
    async queryRecord(serverId, roleId, token) {
        await this.refreshData(serverId, roleId, token);

        const data = qs.stringify({
            'gameId': 3,
            'serverId': serverId,
            'roleId': roleId
        });

        try {
            const response = await axios.post(CONSTANTS.QUERY_RECORD_URL, data, { headers: { ...CONSTANTS.REQUEST_HEADERS_BASE, 'token': token } });

            if (response.data.code === 200) {
                if (response.data.data === null) {
                    logger.mark(logger.blue(`[${basename}]`), logger.yellow(`查询签到领取记录失败，返回空数据`));
                    return { status: false, msg: "查询信息失败，请检查库街区数据终端中对应板块的对外展示开关是否打开" };
                }
                if (config.Config.public.enable_log) {
                    logger.mark(logger.blue(`[${basename}]`), logger.green(`查询签到领取记录成功`));
                }
                return { status: true, data: response.data.data };
            } else {
                logger.mark(logger.blue(`[${basename}]`), logger.red(`查询签到领取记录失败：${response.data.msg}`));
                return { status: false, msg: response.data.msg };
            }
        } catch (error) {
            logger.mark(logger.blue(`[${basename}]`), logger.red(`查询签到领取记录失败，疑似网络问题：\n${error}`));
            return { status: false, msg: '查询签到领取记录失败，疑似网络问题，请检查控制台日志' };
        }
    }

    /**
     * 逆境深塔数据.
     * @param {string} serverId 服务器ID.
     * @param {string} roleId 游戏uid.
     * @param {string} token 库街区token.
     * @returns {object} {status: 获取状态, data?: object msg?: 错误信息}
     */
    async getTowerData(serverId, roleId, token) {
        await this.refreshData(serverId, roleId, token);

        const data = qs.stringify({
            'gameId': 3,
            'serverId': serverId,
            'roleId': roleId
        });

        try {
            const response = await axios.post(CONSTANTS.SELF_TOWER_DATA_URL, data, { headers: { ...CONSTANTS.REQUEST_HEADERS_BASE, 'token': token, devcode: '' } });

            if (response.data.code === 200) {
                response.data.data = JSON.parse(response.data.data);
                if (response.data.data === null) {
                    const other = await axios.post(CONSTANTS.OTHER_TOWER_DATA_URL, data, { headers: { ...CONSTANTS.REQUEST_HEADERS_BASE, 'token': token, devcode: '' } });
                    if (other.data.code === 200) {
                        other.data.data = JSON.parse(other.data.data);
                        if (other.data.data === null) {
                            logger.mark(logger.blue(`[${basename}]`), logger.yellow(`获取逆境深塔数据失败，返回空数据`));
                            return { status: false, msg: "查询信息失败，请检查库街区数据终端中对应板块的对外展示开关是否打开" };
                        }
                        if (config.Config.public.enable_log) {
                            logger.mark(logger.blue(`[${basename}]`), logger.green(`获取逆境深塔数据成功`));
                        }
                        return { status: true, data: other.data.data };
                    } else {
                        logger.mark(logger.blue(`[${basename}]`), logger.red(`获取逆境深塔数据失败：${other.data.msg}`));
                        return { status: false, msg: other.data.msg };
                    }
                }
                if (config.Config.public.enable_log) {
                    logger.mark(logger.blue(`[${basename}]`), logger.green(`获取逆境深塔数据成功`));
                }
                return { status: true, data: response.data.data };
            } else {
                logger.mark(logger.blue(`[${basename}]`), logger.red(`获取逆境深塔数据失败：${response.data.msg}`));
                return { status: false, msg: response.data.msg };
            }
        } catch (error) {
            logger.mark(logger.blue(`[${basename}]`), logger.red(`获取逆境深塔数据失败，疑似网络问题：\n${error}`));
            return { status: false, msg: '获取逆境深塔数据失败，疑似网络问题，请检查控制台日志' };
        }
    }

    /**
     * 抽卡记录.
     * @param {object} data 请求数据 {playerId: 游戏uid, recordId: 抽卡记录ID(有效期1小时), serverId: 服务器ID}
     * @returns {object} {status: 获取状态, data?: object msg?: 错误信息}
     */
    async getGaCha(data) {
        const isCN = data.serverId === "76402e5b20be2c39f095a152090afddc" ? true : false;

        try {
            const response = await axios.post(isCN ? CONSTANTS.GACHA_URL : CONSTANTS.INTL_GACHA_URL, data);

            if (response.data.code === 0) {
                if (response.data.data === null) {
                    logger.mark(logger.blue(`[${basename}]`), logger.yellow(`获取抽卡记录失败，返回空数据`));
                    return { status: false, msg: "查询信息失败，请检查库街区数据终端中对应板块的对外展示开关是否打开" };
                }
                if (config.Config.public.enable_log) {
                    logger.mark(logger.blue(`[${basename}]`), logger.green(`获取抽卡记录成功`));
                }
                return { status: true, data: response.data.data };
            } else {
                logger.mark(logger.blue(`[${basename}]`), logger.red(`获取抽卡记录失败：${response.data.message}`));
                return {
                    status: false,
                    msg: response.data.message.includes('请求游戏获取日志异常')
                        ? '请求游戏获取日志异常, 可能是抽卡链接已失效, 请尝试重新获取.'
                        : response.data.message
                };
            }
        } catch (error) {
            logger.mark(logger.blue(`[${basename}]`), logger.red(`获取抽卡记录失败，疑似网络问题：\n${error}`));
            return { status: false, msg: '获取抽卡记录失败，疑似网络问题，请检查控制台日志' };
        }
    }

    /**
     * 获取公共cookie.
     * @return {object|boolean} {token: 库街区token, userId: 库街区ID, serverId: 服务器ID, roleId: 游戏uid} | false
     */
    async pubCookie() {
        if (!config.Config.use_public_cookie) {return false;}

        const keys = await redis.keys('Yunzai:waves:users:*');
        const values = (await Promise.all(keys.map(key => redis.get(key))))
            .map(value => value ? JSON.parse(value) : null)
            .filter(Boolean)
            .flat()
            .sort(() => Math.random() - 0.5);

        for (const value of values) {
            if (value.token && await this.isAvailable(value.token)) {
                return value;
            }
        }

        return false;
    }

    /**
     * 获取活动列表
     * @param {number} eventType 活动类型 - 0. 近期; 1. 活动; 2. 资讯; 3. 公告
     * @returns {object} {status: 获取状态, data?: object msg?: 错误信息}
     */
    async getEventList(eventType = 0) {
        const data = qs.stringify({
            'gameId': 3,
            'eventType': eventType
        });

        try {
            const response = await axios.post(CONSTANTS.EVENT_LIST_URL, data, { headers: { ...CONSTANTS.REQUEST_HEADERS_BASE } });

            if (response.data.code === 200) {
                if (response.data.data === null) {
                    logger.mark(logger.blue(`[${basename}]`), logger.yellow(`获取活动列表失败，返回空数据`));
                    return { status: false, msg: "查询信息失败，请检查库街区数据终端中对应板块的对外展示开关是否打开" };
                }
                if (config.Config.public.enable_log) {
                    logger.mark(logger.blue(`[${basename}]`), logger.green(`获取活动列表成功`));
                }
                return { status: true, data: response.data.data };
            } else {
                logger.mark(logger.blue(`[${basename}]`), logger.red(`获取活动列表失败：${response.data.msg}`));
                return { status: false, msg: response.data.msg };
            }
        } catch (error) {
            logger.mark(logger.blue(`[${basename}]`), logger.red(`获取活动列表失败，疑似网络问题：\n${error}`));
            return { status: false, msg: '获取活动列表失败，疑似网络问题，请检查控制台日志' };
        }
    }

    // =========== 库街区相关. ===========

    /**
     * 库街区签到.
     * @param {string} token token.
     * @param {string} userId 库街区ID.
     * @returns {object} {status: 请求状态, data?: object msg?: 错误信息}
     */
    async bbsSignIn(token, userId) {
        const data = qs.stringify({
            'gameId': 2
        });

        try {
            const response = await axios.post(CONSTANTS.bbsSignUrl, data, { headers: { ...CONSTANTS.REQUEST_HEADERS_BASE, 'token': token } });

            if (response.data.code === 200) {
                if (config.Config.public.enable_log) {
                    logger.mark(logger.blue(`[${basename}]`), logger.green(`[UserId: ${userId}] 库街区用户签到成功`));
                }
                return { status: true, data: response.data.data };
            } else {
                logger.mark(logger.blue(`[${basename}]`), logger.red(`[UserId: ${userId}] 库街区用户签到失败：${response.data.msg}`));
                return { status: false, msg: response.data.msg };
            }
        } catch (error) {
            logger.mark(logger.blue(`[${basename}]`), logger.red(`[UserId: ${userId}] 库街区用户签到失败，疑似网络问题：\n${error}`));
            return { status: false, msg: '库街区用户签到失败，疑似网络问题，请检查控制台日志' };
        }
    }

    /**
     * 库街区文章点赞.
     * @param {string} postId 文章ID.
     * @param {string} toUserId 文章作者ID.
     * @param {string} token token.
     * @returns {object}  {status: 请求状态, data?: object msg?: 错误信息}
     */
    async like(postId, toUserId, token) {
        const data = qs.stringify({
            'gameId': 3,
            'likeType': 1,
            'operateType': 1,
            'postId': postId,
            'toUserId': toUserId
        });

        try {
            const response = await axios.post(CONSTANTS.LIKE_URL, data, { headers: { ...CONSTANTS.REQUEST_HEADERS_BASE, 'token': token } });

            if (response.data.code === 200) {
                if (config.Config.public.enable_log) {
                    logger.mark(logger.blue(`[${basename}]`), logger.green(`库街区点赞成功`));
                }
                return { status: true, data: response.data.data };
            } else {
                logger.mark(logger.blue(`[${basename}]`), logger.red(`库街区点赞失败：${response.data.msg}`));
                return { status: false, msg: response.data.msg };
            }
        } catch (error) {
            logger.mark(logger.blue(`[${basename}]`), logger.red(`库街区点赞失败，疑似网络问题：\n${error}`));
            return { status: false, msg: '库街区点赞失败，疑似网络问题，请检查控制台日志' };
        }
    }

    /**
     * 库街区文章分享.
     * @param {string} token token.
     * @returns {object} {status: 请求状态, data?: object msg?: 错误信息}
     */
    async share(token) {
        const data = qs.stringify({
            'gameId': 3
        });

        try {
            const response = await axios.post(CONSTANTS.SHARE_URL, data, { headers: { ...CONSTANTS.REQUEST_HEADERS_BASE, 'token': token, devcode: '' } });

            if (response.data.code === 200) {
                if (config.Config.public.enable_log) {
                    logger.mark(logger.blue(`[${basename}]`), logger.green(`库街区分享成功`));
                }
                return { status: true, data: response.data.msg };
            } else {
                logger.mark(logger.blue(`[${basename}]`), logger.red(`库街区分享失败：${response.data.msg}`));
                return { status: false, msg: response.data.msg };
            }
        } catch (error) {
            logger.mark(logger.blue(`[${basename}]`), logger.red(`库街区分享失败，疑似网络问题：\n${error}`));
            return { status: false, msg: '库街区分享失败，疑似网络问题，请检查控制台日志' };
        }
    }

    /**
     * 库街区浏览帖子(获取帖子详情).
     * @param {string} postId 文章ID.
     * @param {string} token token.
     * @returns {object} {status: 请求状态, data?: object msg?: 错误信息}
     */
    async detail(postId, token) {
        const data = qs.stringify({
            'postId': postId
        });

        try {
            const response = await axios.post(CONSTANTS.DETAIL_URL, data, { headers: { ...CONSTANTS.REQUEST_HEADERS_BASE, 'token': token, devcode: '' } });

            if (response.data.code === 200) {
                if (config.Config.public.enable_log) {
                    logger.mark(logger.blue(`[${basename}]`), logger.green(`库街区浏览帖子成功`));
                }
                return { status: true, data: response.data.data };
            } else {
                logger.mark(logger.blue(`[${basename}]`), logger.red(`库街区浏览帖子失败：${response.data.msg}`));
                return { status: false, msg: response.data.msg };
            }
        } catch (error) {
            logger.mark(logger.blue(`[${basename}]`), logger.red(`库街区浏览帖子失败，疑似网络问题：\n${error}`));
            return { status: false, msg: '库街区浏览帖子失败，疑似网络问题，请检查控制台日志' };
        }
    }

    /**
     * 库街区获取帖子列表.
     * @returns {object} {status: 请求状态, data?: object msg?: 错误信息}
     */
    async getPost() {
        const data = qs.stringify({
            'forumId': 9,
            'gameId': 3
        });

        try {
            const response = await axios.post(CONSTANTS.FORUM_LIST, data, { headers: { ...CONSTANTS.REQUEST_HEADERS_BASE, version: '', devcode: '' } });

            if (response.data.code === 200) {
                if (config.Config.public.enable_log) {
                    logger.mark(logger.blue(`[${basename}]`), logger.green(`库街区获取帖子成功`));
                }
                return { status: true, data: response.data.data };
            } else {
                logger.mark(logger.blue(`[${basename}]`), logger.red(`库街区获取帖子失败：${response.data.msg}`));
            }
        } catch (error) {
            logger.mark(logger.blue(`[${basename}]`), logger.red(`库街区获取帖子失败，疑似网络问题：\n${error}`));
        }
    }

    /**
     * 库街区获取任务进度.
     * @param {string} token token.
     * @returns {object} {status: 请求状态, data?: object msg?: 错误信息}
     */
    async taskProcess(token) {
        const data = qs.stringify({
            'gameId': 0
        });

        try {
            const response = await axios.post(CONSTANTS.TASK_PROCESS_URL, data, { headers: { ...CONSTANTS.REQUEST_HEADERS_BASE, 'token': token, devcode: '' } });

            if (response.data.code === 200) {
                if (config.Config.public.enable_log) {
                    logger.mark(logger.blue(`[${basename}]`), logger.green(`库街区获取任务进度成功`));
                }
                return { status: true, data: response.data.data };
            } else {
                logger.mark(logger.blue(`[${basename}]`), logger.red(`库街区获取任务进度失败：${response.data.msg}`));
                return { status: false, msg: response.data.msg };
            }
        } catch (error) {
            logger.mark(logger.blue(`[${basename}]`), logger.red(`库街区获取任务进度失败，疑似网络问题：\n${error}`));
            return { status: false, msg: '库街区获取任务进度失败，疑似网络问题，请检查控制台日志' };
        }
    }

    /**
     * 库街区获取库洛币总数.
     * @param {string} token token.
     * @returns {object} {status: 请求状态, data?: object msg?: 错误信息}
     */
    async getCoin(token) {
        try {
            const response = await axios.post(CONSTANTS.GET_COIN_URL, null, { headers: { ...CONSTANTS.REQUEST_HEADERS_BASE, 'token': token, devcode: '' } });

            if (response.data.code === 200) {
                if (config.Config.public.enable_log) {
                    logger.mark(logger.blue(`[${basename}]`), logger.green(`库街区获取库洛币总数成功`));
                }
                return { status: true, data: response.data.data };
            } else {
                logger.mark(logger.blue(`[${basename}]`), logger.red(`库街区获取库洛币总数失败：${response.data.msg}`));
                return { status: false, msg: response.data.msg };
            }
        } catch (error) {
            logger.mark(logger.blue(`[${basename}]`), logger.red(`库街区获取库洛币总数失败，疑似网络问题：\n${error}`));
            return { status: false, msg: '库街区获取库洛币总数失败，疑似网络问题，请检查控制台日志' };
        }
    }
}

export default new Waves();