import waves from '../components/Code.js';
import { common, karin, segment } from 'node-karin';

/**
 * 新闻查询
 * 查询近期的 活动/新闻/公告/资讯.
 * @param {karin.Event} e
 */
const newsReg = /^(?:～|~|∽|#?鸣潮)(活动|新闻|公告|资讯)$/;

export const News = karin.command(newsReg, async (e) => {
    /**
     * 获取事件类型
     * @param {string} type 新闻类型.
     * @returns {number} 事件类型.
     */
    const getEventKey = (type) => {
        switch (type) {
            case '活动':
                return 1;
            case '资讯':
                return 2;
            case '公告':
                return 3;
            case '新闻':
            default:
                return 0;
        }
    };

    // 定义一个消息数组.
    const data = [];

    // 获取新闻数据.
    const newsData = await waves.getEventList(getEventKey(e.msg.match(newsReg)[1]));

    
    // 若获取失败, 则返回错误信息.
    if (!newsData.status) { return e.reply(`获取${e.msg.match(newsReg)[1]}失败: ${newsData.msg}`); }

    // 截取前20条数据, 并格式化数据.
    newsData.data.list.slice(0, 20).forEach(item => {
        data.push([
            segment.image(item.coverUrl),
            `${item.postTitle}\nhttps://www.kurobbs.com/mc/post/${item.postId}\n\n${new Date(item.publishTime).toLocaleString()}`
        ]);
    });

    // 制作消息.
    const msg = common.makeForward(
        [`${e.msg.match(newsReg)[1]}查询结果: `, ...data],
        e.bot.account.uin,
        e.bot.account.name,
    );

    // 返回新闻数据.
    return e.bot.sendForwardMessage(e.contact, msg);
}, {
    priority: 1009,
    log: true,
    name: '鸣潮-新闻查询',
    permission: 'all',
});