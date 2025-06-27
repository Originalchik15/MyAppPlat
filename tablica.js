/******************************************************************
 * tablica.js – главный сервер (Express + Handlebars + MySQL)
 ******************************************************************/
import express from 'express';
import exphbs  from 'express-handlebars';
import fileUpload from 'express-fileupload';
import session from 'express-session';
import cookieParser from 'cookie-parser';
import path from 'path';
import 'dotenv/config';

import { mlog, test } from './vendor/logs.js';
import {
  getUserByCredentials,
  getApplicationsByUserId,
  createApplication,
  cancelApplication,
  getAdminApplications,
  updateApplication,
  getAllUsers,
  getArchiveApplications,
} from './vendor/db.mjs';

/* статусы */
export const STATUSES = [
  'На рассмотрении','Закупаем','Ждём поставку',
  'Готов к получению','Получено','Пауза','Отклонена',
];
const FILTER_STATUSES = STATUSES.filter(s => !['Получено','Отклонена'].includes(s));

/* служебное */
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const TEMPFOLDER = path.join(__dirname, 'public', 'temp');

const app = express();

/* handlebars */
const hbs = exphbs.create({
  defaultLayout: 'main',
  extname: 'hbs',
  helpers: {
    eq : (a, b) => a === b,
    ne : (a, b) => a !== b,
    and: (a, b) => a && b,
  },
});
app.engine('hbs', hbs.engine);
app.set('view engine', 'hbs');

if (test) {
  app.use(express.static(path.join(__dirname, 'public')));
  app.set('views', path.join(__dirname, 'views'));
} else {
  app.use(express.static(path.join('//', __dirname, 'public')));
  app.set('views', path.join('//', __dirname, 'views'));
}

/* middleware */
app.use(cookieParser());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.set('trust proxy', 1);

app.use(session({
  secret: process.env.SESSION_SECRET || 'keyboard cat',
  resave: true,
  saveUninitialized: false,
  cookie: { secure: false, httpOnly: true },
}));

app.use(fileUpload({
  useTempFiles: true,
  tempFileDir: TEMPFOLDER,
}));

/* auth helpers */
const isAuth  = (req,res,next)=>(req.session.uid?next():res.redirect('/login'));
const hasRole = role => (req,res,next)=>{
  if(!req.session.uid)        return res.redirect('/login');
  if(req.session.roles?.includes(role)) return next();
  res.status(403).send('Доступ запрещён');
};

/* ─── Роуты ─────────────────────────────────────────────────── */

/* логин */
app.get('/login', (req,res)=>res.render('login',{title:'Авторизация'}));

app.post('/login', async (req,res)=>{
  const {login,password}=req.body;
  const user = await getUserByCredentials(login,password);
  if(!user) return res.render('login',{title:'Авторизация',error:'Неверный логин или пароль'});

  req.session.uid   = user.id;
  req.session.name  = user.first_name || user.username;
  req.session.roles = [user.role];
  req.session.save(()=> res.redirect(user.role==='admin'?'/admin':'/user'));
});

app.get('/logout',(req,res)=>req.session.destroy(()=>res.redirect('/login')));

/* пользователь */
app.get('/user', isAuth, hasRole('user'), async (req,res)=>{
  const applications = await getApplicationsByUserId(req.session.uid);
  const today = new Date().toISOString().split('T')[0];
  res.render('user_page',{title:'Страница пользователя',name:req.session.name,applications,role:'user',today});
});

app.post('/create', isAuth, hasRole('user'), async (req,res)=>{
  await createApplication(req.session.uid, req.body);
  res.redirect('/user');
});

app.post('/:id/cancel', isAuth, hasRole('user'), async (req,res)=>{
  await cancelApplication(req.params.id);
  res.redirect('/user');
});

/* админ */
app.get('/admin', isAuth, hasRole('admin'), async (req,res)=>{
  const filter = req.query.status || 'Все';
  const applications = await getAdminApplications(filter);
  res.render('admin_page',{title:'Страница администратора',name:req.session.name,applications,statuses:STATUSES,filterList:['Все',...FILTER_STATUSES],role:'admin',filter});
});

app.get('/admin/users', isAuth, hasRole('admin'), async (req,res)=>{
  const users = await getAllUsers();
  res.render('users_database',{title:'База пользователей',users,role:'admin'});
});

app.post('/:id/update', isAuth, hasRole('admin'), async (req,res)=>{
  const {id}=req.params;
  const {status, manager_comment, expected_delivery=''} = req.body;
  await updateApplication(id, status, manager_comment, expected_delivery || null);
  res.redirect('/admin');
});

/* архив */
app.get('/archive', isAuth, hasRole('admin'), async (req,res)=>{
  const applications = await getArchiveApplications();
  res.render('archive_page',{title:'Архив заказов',applications,role:'admin'});
});

/* корневой */
app.get('/',(req,res)=>{
  if(!req.session.uid) return res.redirect('/login');
  res.redirect(req.session.roles.includes('admin')?'/admin':'/user');
});

/* старт */
const PORT = process.env.PORT || 3000;
app.listen(PORT,()=>mlog('Сервер запущен. Порт:',PORT));
