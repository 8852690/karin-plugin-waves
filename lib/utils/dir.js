import path from 'path';
import { fileURLToPath } from 'url';

/** 当前文件的绝对路径 */
const filePath = fileURLToPath(import.meta.url).replace(/\\/g, '/');

/** 插件包绝对路径 */
const dirPath = path.resolve(filePath, '../../../');

/** 插件包的名称 */
const basename = path.basename(dirPath);

/** 插件数据目录 */
const dataPath = path.join('data', basename).replace(/\\/g, '/');

/** 插件资源目录 */
const resPath = path.join(dirPath, 'resources').replace(/\\/g, '/');

/** 用户配置文件目录 */
const cfgPath = path.join('config', 'plugin', basename).replace(/\\/g, '/');

export { dirPath, basename, dataPath, resPath, cfgPath };
