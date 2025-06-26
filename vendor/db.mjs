import mysql from 'mysql2/promise';
import 'dotenv/config';


const pool = mysql.createPool({
  host:     process.env.DB_HOST,
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port:     process.env.DB_PORT,
  waitForConnections : true,
  connectionLimit    : 10,
  queueLimit         : 0,
});


export async function query(sql, params = []) {
  const [rows] = await pool.execute(sql, params);
  return rows;
}


export async function getUserByCredentials(username, password) {
  const [user] = await query(
    'SELECT * FROM users WHERE username = ? AND password = ?',
    [username, password],
  );
  return user;
}

export async function getApplicationsByUserId(userId) {
  return await query(
    `SELECT *,
            DATE_FORMAT(desired_date,'%d.%m.%Y')  AS desired_date_f,
            DATE_FORMAT(creation_date,'%d.%m.%Y') AS creation_date_f
       FROM applications
      WHERE user_id = ?
   ORDER BY id DESC`,
    [userId],
  );
}

export async function createApplication(userId, { productName, quantity, price, link, desiredDate }) {
  return await query(
    `INSERT INTO applications
            (user_id, product_name, quantity, price, link, desired_date, status)
     VALUES (?,?,?,?,?,?,?)`,
    [userId, productName, quantity, price, link, desiredDate, 'Новая'],
  );
}

export async function cloneApplication(applicationId, userId) {
  const [app] = await query(
    'SELECT * FROM applications WHERE id = ? AND user_id = ?',
    [applicationId, userId],
  );
  if (!app) return null;

  return await query(
    `INSERT INTO applications
            (user_id, product_name, quantity, price, link, desired_date, status)
     VALUES (?,?,?,?,?,?,?)`,
    [
      userId,
      app.product_name,
      app.quantity,
      app.price,
      app.link,
      app.desired_date,
      'Новая',
    ],
  );
}

export async function getActiveApplications() {
  return await query(
    `SELECT a.*,
            u.username,
            DATE_FORMAT(a.desired_date,'%d.%m.%Y')  AS desired_date_f,
            DATE_FORMAT(a.creation_date,'%d.%m.%Y') AS creation_date_f
       FROM applications a
       JOIN users u ON a.user_id = u.id
      WHERE a.status <> 'Завершен'
   ORDER BY a.id DESC`,
  );
}

export async function getAllUsers() {
  return await query('SELECT * FROM users');
}

export async function updateApplication(id, status, manager_comment) {
  return await query(
    'UPDATE applications SET status = ?, manager_comment = ? WHERE id = ?',
    [status, manager_comment, id],
  );
}

export async function getArchive() {
  return await query(
    `SELECT a.*,
            u.username,
            (a.quantity * a.price)                     AS total_cost,
            DATE_FORMAT(a.desired_date,'%d.%m.%Y')     AS desired_date_f,
            DATE_FORMAT(a.creation_date,'%d.%m.%Y')    AS creation_date_f
       FROM applications a
       JOIN users u ON a.user_id = u.id
      WHERE a.status = 'Завершен'
   ORDER BY a.id DESC`,
  );
}
