import {mlog,say,test} from './vendor/logs.js'
import { format } from 'date-fns';
var appDir = path.dirname(import.meta.url);
appDir = appDir.split('///')
appDir = appDir[1]
console.log(appDir);

process.on('uncaughtException', (err) => {
    mlog('Критическая ошибка! ', err.stack);
});

import express from 'express'
import exphbs from 'express-handlebars'
import fileUpload from 'express-fileupload'
import session from 'express-session'
import cookieParser from 'cookie-parser'
import path from 'path'
import fs from 'fs-extra'
import 'dotenv/config'
import * as db from './vendor/db.mjs';
import * as hlp from './vendor/hlp.mjs';
import { type } from 'os';

const app = express();
const hbs = exphbs.create({
defaultLayout: 'main',
extname: 'hbs',
});

const TEMPFOLDER = path.join(appDir,'public/temp');

app.engine('hbs', hbs.engine);
app.set('view engine', 'hbs');
app.set('views', 'views');

if (test){
    app.use(express.static(path.join(appDir, 'public')));
    app.set('views', 'views');
} else {
    app.use(express.static(path.join('//',appDir, 'public')));
    app.set('views',path.join('//',appDir, 'views'));
}

console.log(path.join(appDir, 'public'));
app.use(cookieParser());
app.use(express.urlencoded({ extended: true }));
//app.use(fileupload());
app.set('trust proxy', 1);

app.use(session({resave:true,saveUninitialized:false, secret: 'keyboard cat', cookie: 
    {secure: false, // обязательно false на HTTPS
    httpOnly: true}
}));
app.use(fileUpload({
    useTempFiles : true,
    tempFileDir : TEMPFOLDER,
    defCharset: 'utf8',
    defParamCharset: 'utf8'
}));

app.use(express.json()); // для application/json

app.post('/data', async (req, res) => {
    // console.log(req.body)
    req.session.info = req.body
    res.send('ok')
})

app.post('/datas', async (req, res) => {
    console.log(req.body)
    req.session.info = req.body
    res.send('ok')
})

app.get('/', async (req, res) => {
    //user,manager,admin
    let roles = await db.get_roles(req.session.uid)
    roles = roles.map(obj => obj.ROLE)
    mlog(roles)
    req.session.roles = roles
    res.render('index', {
        title: 'Прогресс репорт',
        roles: req.session.roles,
        name: req.session.name,
        uid: req.session.uid
    })
})

async function start(){
    app.listen(process.env.PORT, ()=> {
        mlog('Сервер прогресса репорта - запущен')
        mlog('Порт: ',process.env.PORT)
    })
}

await start()