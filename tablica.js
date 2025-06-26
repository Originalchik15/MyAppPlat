/******************************************************************
 * tablica.js – главный сервер (Express + Handlebars + MySQL)
 ******************************************************************/
import express            from 'express';
import exphbs             from 'express-handlebars';
import fileUpload         from 'express-fileupload';
import session            from 'express-session';
import cookieParser       from 'cookie-parser';
import path               from 'path';
import 'dotenv/config';

import { mlog, test }     from './vendor/logs.js';

import {
  query,                      // добавили «сырой» запрос
  getUserByCredentials,
  getApplicationsByUserId,
  createApplication,
  getAllUsers,
} from './vendor/db.mjs';

/* ─── константы ─────────────────────────────────────────────── */
const STATUSES = [
  'На рассмотрении',
  'Закупаем',
  'Ждём поставку',
  'Готов к получению',
  'Получено',
  'Пауза',
  'Отклонена',
];
const ARCHIVE_STATUSES = ['Отмена', 'Получено'];

/* ─── __dirname для ESM ────────────────────────────────────── */
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const TEMPFOLDER = path.join(__dirname, 'public', 'temp');

/* ─── Express + Handlebars ─────────────────────────────────── */
const app = express();

const hbs = exphbs.create({
  defaultLayout : 'main',
  extname       : 'hbs',
  helpers       : {
    eq : (a, b) => a === b,
    ne : (a, b) => a !== b,
    and: (a, b) => a && b,
  },
});
app.engine('hbs', hbs.engine);
app.set   ('view engine', 'hbs');

if (test) {
  app.use(express.static(path.join(__dirname, 'public')));
  app.set('views', path.join(__dirname, 'views'));
} else {
  app.use(express.static(path.join('//', __dirname, 'public')));
  app.set('views', path.join('//', __dirname, 'views'));
}

/* ─── middlewares ─────────────────────────────────────────── */
app.use(cookieParser());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.set('trust proxy', 1);

app.use(session({
  secret            : process.env.SESSION_SECRET || 'keyboard cat',
  resave            : true,
  saveUninitialized : false,
  cookie            : { secure: false, httpOnly: true },
}));

app.use(fileUpload({
  useTempFiles   : true,
  tempFileDir    : TEMPFOLDER,
  defCharset     : 'utf8',
  defParamCharset: 'utf8',
}));

process.on('uncaughtException', err => mlog('Критическая ошибка!', err.stack));

/* ─── auth helpers ─────────────────────────────────────────── */
const isAuth  = (req, res, next) => (req.session.uid ? next() : res.redirect('/login'));
const hasRole = role => (req, res, next) => {
  if (!req.session.uid) return res.redirect('/login');
  if (req.session.roles?.includes(role)) return next();
  res.status(403).send('Доступ запрещён');
};

/* ─────────────────────────────────────────────────────────────
 *  Р О У Т Ы
 *─────────────────────────────────────────────────────────────*/

/* --- логин -------------------------------------------------- */
app.get('/login', (req,res)=>res.render('login',{title:'Авторизация'}));

app.post('/login', async (req,res)=>{
  const {login,password}=req.body;
  try{
    const user=await getUserByCredentials(login,password);
    if(!user) return res.render('login',{title:'Авторизация',error:'Неверный логин или пароль'});

    req.session.uid=user.id;
    req.session.name=user.first_name||user.username;
    req.session.roles=[user.role];

    req.session.save(()=>{
      if(user.role==='admin') return res.redirect('/admin');
      res.redirect('/user');
    });
  }catch(err){
    mlog('Ошибка при авторизации:',err);
    res.status(500).send('Внутренняя ошибка сервера');
  }
});

app.get('/logout',(req,res)=>req.session.destroy(()=>res.redirect('/login')));

/* --- страница пользователя --------------------------------- */
app.get('/user', isAuth, hasRole('user'), async (req,res)=>{
  const applications=await getApplicationsByUserId(req.session.uid);
  const today=new Date().toISOString().split('T')[0];
  res.render('user_page',{title:'Страница пользователя',name:req.session.name,applications,role:'user',today});
});

app.post('/applications/create', isAuth, hasRole('user'), async (req,res)=>{
  try{
    await createApplication(req.session.uid, req.body);
    res.redirect('/user');
  }catch(err){
    mlog('Ошибка создания заявки:',err);
    res.status(500).send('Не удалось создать заявку');
  }
});

/* отмена заявки пользователем */
app.post('/applications/:id/cancel', isAuth, hasRole('user'), async (req,res)=>{
  await query('UPDATE applications SET status = ?, manager_comment = ? WHERE id = ?', ['Отмена','Отменено пользователем',req.params.id]);
  res.redirect('/user');
});

/* --- админ -------------------------------------------------- */
app.get('/admin', isAuth, hasRole('admin'), async (req,res)=>{
  const filter = req.query.status || 'Все';
  const sqlBase = `SELECT a.*, u.username, DATE_FORMAT(a.desired_date,'%d.%m.%Y') AS desired_date_f, DATE_FORMAT(a.creation_date,'%d.%m.%Y') AS creation_date_f, DATE_FORMAT(a.expected_delivery,'%d.%m.%Y') AS expected_delivery_f FROM applications a JOIN users u ON a.user_id = u.id`;

  // условие: все, кроме архивных статусов
  let where = `WHERE a.status NOT IN (?, ?)`;
  let params = [...ARCHIVE_STATUSES];

  if(filter !== 'Все') {
    where += ' AND a.status = ?';
    params.push(filter);
  }

  const applications = await query(`${sqlBase} ${where} ORDER BY a.id DESC`, params);

  res.render('admin_page',{
    title   :'Страница администратора',
    name    : req.session.name,
    applications,
    statuses: STATUSES,
    role    :'admin',
    filter,
  });
});

app.get('/admin/users', isAuth, hasRole('admin'), async (req,res)=>{
  const users=await getAllUsers();
  res.render('users_database',{title:'База пользователей',users,role:'admin'});
});

app.post('/applications/:id/update', isAuth, hasRole('admin'), async (req,res)=>{
  const {id}=req.params;
  let {status,manager_comment,expected_delivery}=req.body;
  if(typeof status==='undefined') status=null;
  if(typeof manager_comment==='undefined') manager_comment=null;
  if(typeof expected_delivery==='undefined' || expected_delivery==='') expected_delivery=null;

  await query('UPDATE applications SET status = ?, manager_comment = ?, expected_delivery = ? WHERE id = ?', [status, manager_comment, expected_delivery, id]);
  res.redirect('/admin');
});

/* --- архив -------------------------------------------------- */
app.get('/archive', isAuth, hasRole('admin'), async (req,res)=>{
  const applications = await query(`SELECT a.*, u.username, (a.quantity * a.price) AS total_cost, DATE_FORMAT(a.desired_date, '%d.%m.%Y') AS desired_date_f, DATE_FORMAT(a.creation_date,'%d.%m.%Y') AS creation_date_f, DATE_FORMAT(a.expected_delivery,'%d.%m.%Y') AS expected_delivery_f FROM applications a JOIN users u ON a.user_id = u.id WHERE a.status IN (?, ?) ORDER BY a.id DESC`, ARCHIVE_STATUSES);
  res.render('archive_page',{title:'Архив заказов',applications,role:'admin'});
});

/* --- корневой редирект ------------------------------------- */
app.get('/',(req,res)=>{
  if(!req.session.uid) return res.redirect('/login');
  if(req.session.roles.includes('admin')) return res.redirect('/admin');
  res.redirect('/user');
});

/* ─── запуск ──────────────────────────────────────────────── */
const PORT=process.env.PORT||3000;
app.listen(PORT,()=>mlog('Сервер запущен. Порт:',PORT));