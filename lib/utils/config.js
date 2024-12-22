import fs from 'fs';
import { join } from 'path';
import Yaml from 'node-karin/yaml';
import chokidar from 'node-karin/chokidar';
import { logger, YamlEditor, redis } from 'node-karin';
import { dirPath, basename, dataPath, cfgPath } from '../utils/index.js';

class Cfg {
    /** 配置文件跟路径 */
    dir;
    /** 默认配置文件根路径 */
    defdir;
    /** 缓存 不经常用的不建议缓存 */
    change;
    /** 监听文件 */
    watcher;
    constructor() {
        this.dir = join(cfgPath); // 配置文件路径
        this.defdir = join(dirPath, 'config'); // 默认配置文件路径
        this.userDataDir = join(dataPath, 'UserData'); // 数据文件路径
        this.change = new Map();
        this.watcher = new Map();
        this.initCfg();
    }

    /** 初始化配置 */
    async initCfg() {
        /** 读取默认配置的所有yaml */
        const files = fs.readdirSync(this.defdir).filter(file => file.endsWith('.yaml'));

        // 异步处理
        const mergePromise = files.map(file => {
            const dirPath = `${this.dir}/${file}`;
            const defPath = `${this.defdir}/${file}`;

            // 如果配置文件不存在, 则复制默认配置文件, 并返回
            if (!fs.existsSync(dirPath)) {
                fs.copyFileSync(defPath, dirPath);
                this.watch('config', file.replace('.yaml', ''), dirPath);
                return;
            }

            // 读取配置文件
            const config = new YamlEditor(dirPath);
            const defConfig = new YamlEditor(defPath);

            // 比较配置文件, 检查是否有新增/删除的配置项
            mergeConfig(file.replace(/.yaml$/, ''), defConfig, config, []);
        });

        await Promise.allSettled(mergePromise);

        // 监听用户配置文件
        for (const file of files) {
            this.watch('config', file.replace('.yaml', ''), `${this.dir}/${file}`);
        }
    }

    /**
     * 设置配置
     * @param {string} filePath 配置文件路径
     * @param {string} key 键
     * @param {any} value 值
     */
    setConfig(filePath, key, value) {
        const config = new YamlEditor(filePath);
        config.set(key, value);
        config.save();
    }

    /**
      * 基本配置
      * @returns {JSON} 基本配置
      */
    get Config() {
        const key = 'change.config';
        const res = this.change.get(key);

        /** 取缓存 */
        if (res) { return res; }

        /** 取配置 */
        const config = this.getYaml('config', 'config', true);
        const defSet = this.getYaml('defSet', 'config', false);
        const data = { ...defSet, ...config };

        /** 缓存 */
        this.change.set(key, data);
        return data;
    }

    /**
     * 任务列表
     * @returns {JSON} 任务列表
     */
    get taskList() {
        const key = 'change.taskList';
        const res = this.change.get(key);

        /** 取缓存 */
        if (res) { return res; }

        /** 取配置 */
        const config = this.getYaml('config', 'taskList', true);
        const defCfg = this.getYaml('defSet', 'taskList', false);
        const data = { ...defCfg, ...config };

        /** 缓存 */
        this.change.set(key, data);
        return data;
    }

    /**
      * package.json
      * 这里建议采用实时读取 不建议缓存
      * @returns {JSON} package.json
      */
    get package() {
        const data = fs.readFileSync(dirPath + '/package.json', 'utf8');
        const pkg = JSON.parse(data);
        return pkg;
    }

    /**
      * 获取配置yaml
      * @param {'defSet'|'config'} type 默认跑配置-defSet, 用户配置-config
      * @param {string} name 名称
      * @param {boolean} isWatch 是否监听
      * @returns {Yaml} 使用Yaml.parse解析
      */
    getYaml(type, name, isWatch = false) {
        /** 文件路径 */
        const file = type === 'defSet'
            ? `${this.defdir}/${name}.yaml`
            : `${this.dir}/${name}.yaml`;

        /** 读取文件 */
        const data = Yaml.parse(fs.readFileSync(file, 'utf8'));

        /** 监听文件 */
        if (isWatch) { this.watch(type, name, file); }
        return data;
    }

    /**
      * 监听配置文件
      * @param {'defSet'|'config'} type 类型
      * @param {string} name 文件名称 不带后缀
      * @param {string} file 文件路径
      */
    async watch(type, name, file) {
        const key = `change.${name}`;
        /** 已经监听过了 */
        const res = this.change.get(key);
        if (res) { return true; }
        const watch = this.watcher.get(key);
        if (watch) { return true; }
        /** 监听文件 */
        const watcher = chokidar.watch(file);
        /** 监听文件变化 */
        watcher.on('change', () => {
            this.change.delete(key);
            logger.mark(`[${basename}][修改配置文件][${type}][${name}]`);
            /** 文件修改后调用对应的方法 请自行使用 */
            // switch (`change_${name}`) {
            //   case 'change_App':
            //     this.change_App()
            //     break
            //   case 'change_config':
            //     this.change_config()
            //     break
            //   case 'change_group':
            //     this.change_group()
            //     break
            // }
        });
        /** 缓存 防止重复监听 */
        this.watcher.set(key, watcher);
    }

    /**
     * 获取用户数据
     * @param {string | number} user_id 用户ID
     * @returns {array} 用户数据, 不存在则返回空数组
     */
    getUserData(user_id) {
        // 用户数据文件路径
        const userCfg = `${this.userDataDir}/${user_id}.yaml`;

        // 读取用户数据并返回
        try {
            return fs.existsSync(userCfg) ? Yaml.parse(fs.readFileSync(userCfg, 'utf8')) : [];
        }
        catch (err) {
            logger.error(logger.blue(`[${basename}]`),` 读取用户数据失败: ${err.message}`);
            return [];
        }
    }

    /**
     * 保存用户数据
     * @param {string | number} user_id 用户ID
     * @param {array} data 用户数据
     * @returns {boolean} 保存结果
     */
    setUserData(user_id, data) {
        // 用户数据文件路径
        const userCfg = `${this.userDataDir}/${user_id}.yaml`;

        // 保存用户数据
        try {
            if (data.length) {
                fs.writeFileSync(userCfg, Yaml.stringify(data));
                redis.set(`karin:waves:users:${user_id}`, JSON.stringify(data));
                return true;
            }
            // 如果数据为空, 则删除用户数据文件
            else {
                if (fs.existsSync(userCfg)) { fs.unlinkSync(userCfg); }
                redis.del(`karin:waves:users:${user_id}`);
                return true;
            }
        }
        catch (err) {
            logger.error(logger.blue(`[${basename}]`),` 保存用户数据失败: ${err.message}`);
            return false;
        }
    }

    /**
     * 添加任务列表
     * @param {string} act 操作
     * @param {string} key 键
     * @param {any} value 值
     * @returns {boolean} 添加结果
     */
    taskListCfg(act, key, value) {
        const taskList = new YamlEditor(`${this.dir}/taskList.yaml`);
        try {
            taskList[act](key, value);
            taskList.save();

            return true;
        } catch (err) {
            logger.error(logger.blue(`[${basename}]`),` 操作任务列表失败: ${err.message}`);
            return false;
        }
    }
}

/**
 * 比较 2 个配置文件, 并将 defConfig 的变更合并到 config 中, 同时保留注释
 * @param {string} name - 配置文件名称
 * @param {YamlEditor} defEditor - 默认配置文件编辑器
 * @param {YamlEditor} configEditor - 配置文件编辑器
 * @param {string[]} path - 当前路径
 * @param {Set<string>} visitedPaths - 已访问路径集合, 用于防止路径无限扩展
 * @returns {boolean} 处理结果
 */
function mergeConfig(name, defEditor, configEditor, path = [], visitedPaths = new Set()) {
    const fullPath = path.join('.');

    // 防止无限路径扩展
    if (visitedPaths.has(fullPath)) { return false; }
    visitedPaths.add(fullPath);

    const defNode = defEditor.get(path.join('.'));
    const confNode = configEditor.get(path.join('.'));

    // 确保 defNode 存在且为对象
    if (!defNode || typeof defNode !== 'object') { return false; }

    // 不更新类型为数组的配置项
    if (Array.isArray(defNode)) {
        // 如果默认配置是数组，不删除用户配置中的内容，只更新为空数组的默认值
        if (!confNode || !Array.isArray(confNode)) {
            const status = configEditor.set(fullPath, defNode);
            if (status) {
                logger.info(logger.blue(`[${basename}]`), ` 更新 ${name} 数组配置: ${fullPath} -> `, logger.green(JSON.stringify(defNode)));
            }
        }
        // 跳过无效项检测，因为数组中的元素由用户自由管理
        return true;
    }

    // 提取键列表（仅处理对象）
    const defKeys = typeof defNode === 'object' && defNode ? Object.keys(defNode) : [];
    const confKeys = typeof confNode === 'object' && confNode ? Object.keys(confNode) : [];

    // 合并对象键
    for (const key of defKeys) {
        const itemPath = [...path, key];
        const itemFullPath = itemPath.join('.');

        if (!confKeys.includes(key)) {
            // 新增配置项
            const status = configEditor.set(itemFullPath, defNode[key]);
            if (status) {
                logger.info(logger.blue(`[${basename}]`), ` 新增 ${name} 配置项: ${itemFullPath} -> `, logger.green(JSON.stringify(defNode[key])));
            }
        } else {
            // 处理嵌套对象或数组
            mergeConfig(name, defEditor, configEditor, itemPath, visitedPaths);
        }
    }

    // 删除无效配置项
    for (const key of confKeys) {
        const itemPath = [...path, key];
        const itemFullPath = itemPath.join('.');

        if (!defKeys.includes(key)) {
            const status = configEditor.del(itemFullPath);
            if (status) {
                logger.warn(logger.blue(`[${basename}]`), ` 删除 ${name} 无效配置项: `, logger.red(itemFullPath));
            }
        }
    }

    // 保存配置
    configEditor.save();
    return true;
}

/**
 * 配置文件
 */
export default new Cfg();
