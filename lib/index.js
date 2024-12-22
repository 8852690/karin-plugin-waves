import './utils/init.js';
import { logger } from 'node-karin';
import { basename, config } from './utils/index.js';
/** 请不要在这编写插件 不会有任何效果~ */
logger.info(logger.blue(`[${basename}]`), '有问题请到QQ群 【貓娘樂園🍥🏳️‍⚧️】(707331865) 反馈.');
logger.info(logger.blue(`[${basename}]`), `v${config.package.version} 加载完成.`);
