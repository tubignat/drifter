import { createServer } from "http";
import { FlowState } from "./core";

export function startDebugServer() {
    if (!started) {
        const server = createServer((req, res) => {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(generateHTML(req.url ?? ""));
        });

        server.listen(3999, () => console.log("Debug server: http://localhost:3999"));
        started = true;
    }
}

let started = false;
const flows: { [key: string]: FlowState } = {};

export function saveStateForDebug(flow: FlowState) {
    flows[flow.id] = flow;
}

function generateHTML(path: string) {
    const key = path.replace('/', '');

    const sorted = Object.keys(flows).sort((a, b) => {
        if (flows[a]?.kvs["updated"] == null || flows[b]?.kvs["updated"] == null) {
            throw new Error("Invalid state");
        }

        const aDate = new Date(flows[a].kvs["updated"]);
        const bDate = new Date(flows[b].kvs["updated"]);
        return bDate > aDate ? 1 : -1;
    });

    const flow = flows[key] ?? flows[sorted[0] ?? ''];

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Flow Stack Visualization</title>
    <style>
        body { font-family: sans-serif; background: #f9f9f9; color: #222; }
        .flow { border-left: 3px solid #bbb; margin: 8px 0 8px 0; padding-left: 8px; }
        .flow-header { font-weight: bold; margin-bottom: 2px; }
        .flow-id { color: #1976d2; }
        .flow-status.executed { color: #388e3c; margin-left: 8px; }
        .flow-status.pending { color: #fbc02d; margin-left: 8px; }
        .flow-status.error { color: #d32f2f; margin-left: 8px; }
        .flow-result, .flow-error, .flow-kvs { margin: 2px 0 2px 12px; font-size: 0.97em; }
        .flow-error { color: #d32f2f; border-left: 3px solid #d32f2f; padding-left: 8px; }
        .kv-table { border-collapse: collapse; margin: 2px 0; }
        .kv-table td { border: 1px solid #eee; padding: 2px 6px; vertical-align: top; }
        .kv-key { color: #555; font-weight: bold; }
        .kv-val { color: #222; }
        .string { color: #388e3c; }
        .number { color: #1976d2; }
        .boolean { color: #fbc02d; }
        .null { color: #aaa; }
        .json-inline { cursor: pointer; }
        .expand-btn { cursor: pointer; }
        .json-pretty { margin-top: 4px; }
        .stack-root { margin-left: 24px; }
    </style>
</head>
<body>
    <div style="display: flex; padding: 12px;">
        <div class="sidebar">
            ${renderSidebar(sorted)}
        </div>
        <div class="stack-root">
            <h2>Flow State</h2>
            <div style="max-width: 90vw; overflow-x: auto; margin-left: -30px">
                ${flow != null ? renderFlow(flow.subflows[0]!) : ''}
            </div>
        </div>
    </div>
</body>
</html>`;
}

function renderSidebar(sorted: string[]) {
    return `${sorted.map(key => `<a href="/${key}" style="">${flows[key]!.id}</a><br>`)}`
}

function renderFlow(flow: FlowState, depth = 0) {
    // Determine status icon and color
    let statusHtml = '';

    if (flow.error !== undefined && flow.error !== null) {
        statusHtml = '<span class="flow-status error" title="Error">❌</span>';
    } else if (flow.executed) {
        statusHtml = '<span class="flow-status executed" title="Executed">✔</span>';
    } else {
        statusHtml = '<span class="flow-status pending" title="Pending">⏳</span>';
    }
    let html = `<div class="flow" style="margin-left:36px">
        <div class="flow-header">
            <span class="flow-id">${escapeHtml(flow.id)}</span>
            ${statusHtml}
        </div>`;
    if (flow.result !== undefined) {
        if (typeof flow.result === 'object' && flow.result !== null) {
            html += `<div class="flow-result"><b>Result:</b> ${renderValue(flow.result, { resultObject: true })}</div>`;
        } else {
            html += `<div class="flow-result"><b>Result:</b> ${renderValue(flow.result)}</div>`;
        }
    }
    if (flow.kvs && Object.keys(flow.kvs).length > 0) {
        html += `<div class="flow-kvs"><b>KVs:</b> ${renderValue(flow.kvs)}</div>`;
    }
    if (flow.subflows && flow.subflows.length > 0) {
        html += `<div class="flow-subflows">` +
            flow.subflows.map(sf => renderFlow(sf, depth + 1)).join('') +
            (flow.error != null ? `<div class="flow-error" style="margin-left:36px"><b>error:</b> ${renderValue(flow.error)}</div>` : '') +
            `</div>`;
    }
    html += '</div>';
    return html;
}

function escapeHtml(str: any) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function renderValue(val: any, opts: { [key: string]: any } = {}): string {
    if (val === null || val === undefined) return '<span class="null">null</span>';
    if (typeof val === 'object') {
        if (Array.isArray(val)) {
            if (val.length === 0) return '[]';
            return '<ul>' + val.map(v => `<li>${renderValue(v, opts)}</li>`).join('') + '</ul>';
        }
        // object
        if (opts["resultObject"]) {
            // Render as single-line JSON with expand/collapse for pretty-print
            const jsonStr = JSON.stringify(val);
            const pretty = JSON.stringify(val, null, 2);
            const id = 'json-' + Math.random().toString(36).slice(2, 10);
            return `<span class="json-inline" style="max-width:480px; display:inline-block; overflow-x:auto; white-space:nowrap; background:#f5f5f5; border:1px solid #eee; padding:2px 6px; border-radius:3px; font-family:monospace; color:#1976d2;">${escapeHtml(jsonStr)}</span>
            <button class="expand-btn" onclick="var e=document.getElementById('${id}'); e.style.display=e.style.display==='none'?'block':'none'; this.textContent=e.style.display==='none'?'Expand':'Collapse';" style="margin-left:6px; font-size:0.9em;">Expand</button>
            <pre id="${id}" class="json-pretty" style="display:none; background:#f5f5f5; border:1px solid #eee; padding:6px; border-radius:3px; font-family:monospace; color:#1976d2; max-width:90vw; overflow-x:auto;">${escapeHtml(pretty)}</pre>`;
        }
        const keys = Object.keys(val);
        if (keys.length === 0) return '{}';
        return '<table class="kv-table">' +
            keys.map(k => `<tr><td class="kv-key">${escapeHtml(k)}</td><td class="kv-val">${renderValue(val[k], opts)}</td></tr>`).join('') +
            '</table>';
    }
    if (typeof val === 'string') return `<span class="string">"${escapeHtml(val)}"</span>`;
    if (typeof val === 'number' || typeof val === 'boolean') return `<span class="${typeof val}">${escapeHtml(val)}</span>`;
    return escapeHtml(String(val));
}