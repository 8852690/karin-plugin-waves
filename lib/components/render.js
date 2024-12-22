import { join } from 'path';
import cfg from '../utils/config.js';
import { render, Cfg, segment } from 'node-karin';
import { basename, resPath } from '../utils/dir.js';

// 获取渲染精度
function getScale(pct = 1) {
    const scale = Math.min(2, Math.max(0.5, cfg.Config.public.render_scale / 100));
    pct = pct * scale;
    return `style=transform:scale(${pct})`;
}

// 保存时间戳, 防止快速渲染时出现异常.
const time = {};
function getsaveId(name) {
    if (!time[name]) {time[name] = 0;}

    time[name]++;

    if (time[name] === 1) {
        setTimeout(() => {
            time[name] = 0;
        }, 10000);
    }

    return `${name}_${time[name]}`;
}

const Render = {
    /**
     * 
     * @param {string} tplPath 渲染模板路径
     * @param {object} params 渲染参数
     */
    async render(tplPath, params) {
        tplPath = tplPath.replace(/.html$/, '');

        const layoutPath = join(resPath, 'common', 'layout').replace(/\\/g, '/');
        const fileID = getsaveId(tplPath.split('/')[2]);
        const tplFile = join(resPath, `${tplPath}.html`).replace(/\\/g, '/');
        
        const data = {
            name: `${basename}/${tplPath}`,
            file: tplFile,
            tplFile,
            type: 'png',
            fileID,
            saveID: fileID,
            _res_path: resPath,
            pluResPath: resPath,
            pluginResources: resPath,
            _layout_path: layoutPath,
            defaultLayout: layoutPath + 'default.html',
            elemLayout: layoutPath + 'elem.html',
            sys: { scale: getScale(params.scale || 1), },
            avatarUrl: params?.avatarUrl || '',
            copyright: params?.copyRight || `Created By <span class="version">Karin</span> v${Cfg.package.version} & <span class="version">${basename}</span> v${cfg.package.version}`,
            ...params,
        };

        const options = {
            data,
            name: data.name,
            type: data.type,
            file: data.file,
            fileID: data.saveID,
            setViewport: data.setViewport,
            pageGotoParams: data.pageGotoParams,
        };

        return segment.image(await render.render(options));
    }
};

export default Render;