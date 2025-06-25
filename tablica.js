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
    helpers: {
        eq: function (a, b) {
            return a === b;
        }
    }
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

app.set('trust proxy', 1);

app.use(session({resave:true,saveUninitialized:false, secret: 'keyboard cat', cookie: 
    {secure: false, 
    httpOnly: true}
}));
app.use(fileUpload({
    useTempFiles : true,
    tempFileDir : TEMPFOLDER,
    defCharset: 'utf8',
    defParamCharset: 'utf8'
}));

app.use(express.json()); 

app.post('/data', async (req, res) => {
    req.session.info = req.body
    res.send('ok')
})

app.post('/datas', async (req, res) => {
    console.log(req.body)
    req.session.info = req.body
    res.send('ok')
})




const isAuth = (req, res, next) => {
    if (req.session.uid) return next();
    res.redirect('/login');
};

const hasRole = (role) => {
    return (req, res, next) => {
        if (!req.session.uid) return res.redirect('/login');
        if (req.session.roles && req.session.roles.includes(role)) return next();
        res.status(403).send('Доступ запрещен');
    };
};

// логин
app.get('/login', (req, res) => {
    res.render('login', { title: 'Авторизация', layout: 'main' });
});

app.post('/login', async (req, res) => {
    const { login, password } = req.body;
    try {
        const [user] = await db.query('SELECT * FROM users WHERE username = ? AND password = ?', [login, password]);
        if (user) {
            req.session.uid = user.id;
            req.session.name = user.first_name || user.username;
            req.session.roles = [user.role];
            req.session.save(() => {
                if (user.role === 'admin') return res.redirect('/admin');
                res.redirect('/user');
            });
        } else {
            res.render('login', { title: 'Авторизация', error: 'Неверный логин или пароль' });
        }
    } catch (error) {
        mlog('Ошибка при входе:', error);
        res.status(500).send('Внутренняя ошибка сервера');
    }
});

app.get('/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/login');
    });
});

// юзерка
app.get('/user', isAuth, hasRole('user'), async (req, res) => {
    const applications = await db.query('SELECT *, DATE_FORMAT(desired_date, "%d.%m.%Y") AS desired_date_f, DATE_FORMAT(creation_date, "%d.%m.%Y") AS creation_date_f FROM applications WHERE user_id = ? ORDER BY id DESC', [req.session.uid]);
    res.render('user_page', { title: 'Страница пользователя', name: req.session.name, applications: applications });
});

app.post('/applications/create', isAuth, hasRole('user'), async (req, res) => {
    const { productName, quantity, price, link, desiredDate } = req.body;
    await db.query('INSERT INTO applications (user_id, product_name, quantity, price, link, desired_date, status) VALUES (?, ?, ?, ?, ?, ?, ?)', [req.session.uid, productName, quantity, price, link, desiredDate, 'Новая']);
    res.redirect('/user');
});

app.post('/applications/:id/clone', isAuth, hasRole('user'), async (req, res) => {
    const { id } = req.params;
    const [appToClone] = await db.query('SELECT * FROM applications WHERE id = ? AND user_id = ?', [id, req.session.uid]);
    if (appToClone) {
        await db.query('INSERT INTO applications (user_id, product_name, quantity, price, link, desired_date, status) VALUES (?, ?, ?, ?, ?, ?, ?)', [req.session.uid, appToClone.product_name, appToClone.quantity, appToClone.price, appToClone.link, appToClone.desired_date, 'Новая']);
    }
    res.redirect('/user');
});

// админка
app.get('/admin', isAuth, hasRole('admin'), async (req, res) => {
    const applications = await db.query("SELECT a.*, u.username, DATE_FORMAT(a.desired_date, '%d.%m.%Y') AS desired_date_f, DATE_FORMAT(a.creation_date, '%d.%m.%Y') AS creation_date_f FROM applications a JOIN users u ON a.user_id = u.id WHERE a.status != 'Завершен' ORDER BY a.id DESC");
    res.render('admin_page', { title: 'Страница администратора', name: req.session.name, applications: applications });
});

app.get('/admin/users', isAuth, hasRole('admin'), async (req, res) => {
    const users = await db.query('SELECT * FROM users');
    res.render('users_database', { title: 'База пользователей', users: users });
});

app.post('/applications/:id/update', isAuth, hasRole('admin'), async (req, res) => {
    const { id } = req.params;
    const { status, manager_comment } = req.body;
    await db.query('UPDATE applications SET status = ?, manager_comment = ? WHERE id = ?', [status, manager_comment, id]);
    res.redirect('/admin');
});

app.get('/archive', isAuth, hasRole('admin'), async (req, res) => {
    const applications = await db.query("SELECT a.*, u.username, (a.quantity * a.price) AS total_cost, DATE_FORMAT(a.desired_date, '%d.%m.%Y') AS desired_date_f, DATE_FORMAT(a.creation_date, '%d.%m.%Y') AS creation_date_f FROM applications a JOIN users u ON a.user_id = u.id WHERE a.status = 'Завершен' ORDER BY a.id DESC");
    res.render('archive_page', { title: 'Архив заказов', applications: applications });
});


app.get('/', (req, res) => {
    if (req.session.uid) {
        if (req.session.roles.includes('admin')) return res.redirect('/admin');
        return res.redirect('/user');
    }
    res.redirect('/login');
});


async function start(){
    app.listen(process.env.PORT, ()=> {
        mlog('Сервер прогресса репорта - запущен')
        mlog('Порт: ',process.env.PORT)
    })
}

await start()