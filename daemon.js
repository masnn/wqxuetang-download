const fs = require('fs');
const path = require('path');
const axios = require('axios');
var jwt = require('jsonwebtoken');
const os = require('os');
const op = os.platform() == 'win32' ? '\\' : '/';
const tough = require('tough-cookie');
const axiosCookieJarSupport = require('axios-cookiejar-support').default;
axiosCookieJarSupport(axios);
const cookieJar = new tough.CookieJar();
const jwtSecret = "g0NnWdSE8qEjdMD8a1aq12qEYphwErKctvfd3IktWHWiOBpVsgkecur38aBRPn2w"
let queue = [];
const sleep = t => new Promise(r => { setTimeout(r, t) });
async function daemon() {
    while (true) {
        console.log(queue.length);
        while (!queue.length) await sleep(100);
        let t = queue.shift();
        let res;
        try {
            if (!t.url) t.url = t.urlgen(t);
            res = await axios(t);
        } catch (e) {
            if (t.urlgen) t.url = null;
            queue.push(t);
            await sleep(500);
            continue;
        }
        if (t.process) res = t.process(res);
        let p = res.path || res.request.path;
        if (p != '::ignore') {
            p = p.split('');
            p.shift();
            p = p.join('');
            if (p.endsWith('/') || p == '') p = p + 'index.html';
            let tgt = path.resolve(__dirname, 'target', p);
            let f = tgt.split(op).slice(0, -1).join(op);
            if (!fs.existsSync(f)) fs.mkdirSync(f, { recursive: true });
            if (t.responseType == 'stream')
                res.data.pipe(fs.createWriteStream(tgt));
            else if (typeof res.data == 'object')
                fs.writeFileSync(tgt, JSON.stringify(res.data));
            else
                fs.writeFileSync(tgt, res.data);
        }
        await sleep(500);
    }
}
function key(aesK, bid, pid) {
    let p1 = {
        p: pid,
        t: Date.parse(new Date),
        b: bid.toString(),
        w: 1000,
        k: aesK
    }
    return jwt.sign(p1, jwtSecret);
}
async function get(bid) {
    queue.push({
        url: `https://lib-nuanxin.wqxuetang.com/v1/read/initread?bid=${bid}`,
        method: 'GET',
        process: res => {
            queue.push({
                url: `https://lib-nuanxin.wqxuetang.com/v1/read/k?bid=${bid}`,
                jar: cookieJar,
                withCredentials: true,
                method: 'GET',
                headers: {
                    'referer': `https://lib-nuanxin.wqxuetang.com/read/pdf/${bid}`,
                    'accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
                    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/79.0.3945.130 Safari/537.36'
                },
                process: re => {
                    let aesK = JSON.stringify(re.data.data)
                    for (let i = 1; i <= res.data.data.pages; i++) {
                        queue.push({
                            method: 'GET',
                            aesK, bid, i,
                            urlgen: t => `https://lib-nuanxin.wqxuetang.com/page/img/${bid}/${i}?k=${key(t.aesK, t.bid, t.i)}`,
                            process: r => {
                                r.path = `/${res.data.data.title}/${i}.jpeg`;
                                return r;
                            },
                            jar: cookieJar,
                            withCredentials: true,
                            responseType: 'stream',
                            headers: {
                                'referer': `https://lib-nuanxin.wqxuetang.com/read/pdf/${bid}`,
                                'accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
                                'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/79.0.3945.130 Safari/537.36'
                            }
                        })
                    }
                    re.path = '::ignore';
                    return re;
                }
            });
            res.path = `/${res.data.data.title}/info.json`
            return res;
        }
    });
}
daemon();
process.stdin.setEncoding('utf8');
process.stdin.on('data', input => { get(input.toString().trim()); });
