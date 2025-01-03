import lodash from 'node-karin/lodash';
import moment from 'node-karin/moment';

class Common {
    /**
     * 生成随机数
     * @param min - 最小值
     * @param max - 最大值
     * @returns
     */
    random (min, max) {
        return lodash.random(min, max);
    }

    /**
     * 睡眠函数
     * @param ms - 毫秒
     */
    sleep (ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * 使用moment返回时间
     * @param format - 格式
     */
    time (format = 'YYYY-MM-DD HH:mm:ss') {
        return moment().format(format);
    }

    /**
     * 根据 limit 分割数组, 每个数组的长度为 limit
     * @param {Array} arr 数组
     * @param {number} limit 限制
     */
    splitArray (arr, limit) {
        return lodash.chunk(arr, limit);
    }
}

export const common = new Common();
