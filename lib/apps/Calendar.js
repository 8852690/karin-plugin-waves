import { join } from 'path';
import { karin } from 'node-karin';
import wiki from '../components/Wiki.js';
import { resPath } from '../utils/dir.js';
import Render from '../components/render.js';


/**
 * 日历
 * 返回 角色卡池、武器卡池、活动等信息
 * @param {karin.Event} e
 */
const calendarReg = /^(～|~|∽|#?鸣潮)(日历|日历列表|当前卡池)$/;
export const Calendar = karin.command(calendarReg, async (e) => {
    // 尝试获取首页内容.
    const pageData = await wiki.getHomePage();

    // 如果获取失败，返回错误信息.
    if (!pageData.status) { return e.reply(`获取日历内容失败: ${pageData.msg}`); }

    // 当前日期.
    const currentDate = new Date();

    // 角色卡池信息.
    const role = {
        imgs: pageData.data.contentJson.sideModules[0].content.tabs.flatMap(tab => tab.imgs).map(item => item.img),
        description: pageData.data.contentJson?.sideModules?.[0]?.content?.tabs?.[0]?.description || '',
        unstart: new Date(pageData.data.contentJson?.sideModules?.[0]?.content?.tabs?.[0]?.countDown?.dateRange?.[0]) > currentDate,
        time: format(Math.max(Math.round((new Date(pageData.data.contentJson?.sideModules?.[0]?.content?.tabs?.[0]?.countDown?.dateRange?.[1]) - currentDate) / 1000), 0)),
        progress: Math.round(((currentDate - new Date(pageData.data.contentJson?.sideModules?.[0]?.content?.tabs?.[0]?.countDown?.dateRange?.[0])) /
            (new Date(pageData.data.contentJson?.sideModules?.[0]?.content?.tabs?.[0]?.countDown?.dateRange?.[1]) - new Date(pageData.data.contentJson?.sideModules?.[0]?.content?.tabs?.[0]?.countDown?.dateRange?.[0]))) * 100)
    };

    // 武器卡池信息.
    const weapon = {
        imgs: pageData.data.contentJson.sideModules[1].content.tabs.flatMap(tab => tab.imgs).map(item => item.img),
        description: pageData.data.contentJson?.sideModules?.[1]?.content?.tabs?.[0]?.description || '',
        unstart: new Date(pageData.data.contentJson?.sideModules?.[1]?.content?.tabs?.[0]?.countDown?.dateRange?.[0]) > currentDate,
        time: format(Math.max(Math.round((new Date(pageData.data.contentJson?.sideModules?.[1]?.content?.tabs?.[0]?.countDown?.dateRange?.[1]) - currentDate) / 1000), 0)),
        progress: Math.round(((currentDate - new Date(pageData.data.contentJson?.sideModules?.[1]?.content?.tabs?.[0]?.countDown?.dateRange?.[0])) /
            (new Date(pageData.data.contentJson?.sideModules?.[1]?.content?.tabs?.[0]?.countDown?.dateRange?.[1]) - new Date(pageData.data.contentJson?.sideModules?.[1]?.content?.tabs?.[0]?.countDown?.dateRange?.[0]))) * 100)
    };

    // 活动信息.
    const activity = (pageData.data.contentJson?.sideModules?.[2]?.content || []).map(item => {
        const dateRange = item.countDown?.dateRange || ["", ""];
        const [startDateStr, endDateStr] = dateRange.map(dateStr => dateStr ? new Date(dateStr) : null);
        const startDate = startDateStr || null;
        const endDate = endDateStr || null;

        const startTime = startDate ? `${startDate.toLocaleDateString('zh-CN').slice(5).replace('/', '.')} ${startDate.toTimeString().slice(0, 5)}` : '';
        const endTime = endDate ? `${endDate.toLocaleDateString('zh-CN').slice(5).replace('/', '.')} ${endDate.toTimeString().slice(0, 5)}` : '';

        const activeStatus = item.countDown
            ? (startDate && currentDate >= endDate ? '已结束' :
                (startDate && currentDate >= startDate ? '进行中' : '未开始'))
            : '';

        const remain = activeStatus === '进行中' && endDate
            ? format(Math.round((endDate - currentDate) / 1000))
            : '';

        const progress = startDate && endDate && currentDate >= startDate
            ? Math.round(((currentDate - startDate) / (endDate - startDate)) * 100)
            : 0;

        return {
            contentUrl: item.contentUrl || '',
            title: item.title || '',
            time: startTime && endTime ? `${startTime} - ${endTime}` : '',
            active: activeStatus,
            remain: remain,
            progress: progress,
        };
    });

    const s = 1716753600000;
    const d = 1209600000;

    activity.unshift({
        contentUrl: join(resPath, '/Template/calendar/imgs/tower.png'),
        title: '深境再临',
        time: (() => {
            const cs = s + Math.floor((currentDate - s) / d) * d;
            return `${new Date(cs).toLocaleDateString('zh-CN').slice(5).replace('/', '.')} ${new Date(cs).toTimeString().slice(0, 5)} - ${new Date(cs + d).toLocaleDateString('zh-CN').slice(5).replace('/', '.')} ${new Date(cs + d).toTimeString().slice(0, 5)}`;
        })(),
        active: '进行中',
        remain: format(Math.round((s + Math.floor((currentDate - s) / d) * d + d - currentDate) / 1000)),
        progress: Math.round(((currentDate - (s + Math.floor((currentDate - s) / d) * d)) / d) * 100),
    });

    // 渲染日历页面并返回.
    return e.reply(await Render.render('Template/calendar/calendar', {
        data: { activity, role, weapon },
    }));
}, {
    priority: 1009,
    log: true,
    name: '鸣潮-日历',
    permission: 'all'
});

/**
 * 格式化时间
 * @param {number} seconds 时间戳
 * @returns {string} 格式化后的时间: 1天2小时3分钟
 */
function format(seconds) {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    return `${days ? `${days}天` : ''}${days || hours ? `${hours}小时` : ''}${days || hours || minutes ? `${minutes}分钟` : ''}`.trim();
}