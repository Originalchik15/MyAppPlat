import mysql from 'mysql2/promise';
import 'dotenv/config';

/* ─── подключение ────────────────────────────────────────────── */
const pool = mysql.createPool({
  host               : process.env.DB_HOST,
  user               : process.env.DB_USER,
  password           : process.env.DB_PASSWORD,
  database           : process.env.DB_NAME,
  port               : process.env.DB_PORT,
  waitForConnections : true,
  connectionLimit    : 10,
  queueLimit         : 0,
});
export async function query(sql, params = []) {
  const [rows] = await pool.execute(sql, params);
  return rows;
}

/* ─── auth ───────────────────────────────────────────────────── */
export async function getUserByCredentials(username, password) {
  const [user] = await query(
    'SELECT * FROM users WHERE username = ? AND password = ?',
    [username, password],
  );
  return user;
}

/* ─── пользовательские заявки ───────────────────────────────── */
export async function getApplicationsByUserId(userId) {
  return query(
    `SELECT *,
            DATE_FORMAT(desired_date,'%d.%m.%Y')  AS desired_date_f,
            DATE_FORMAT(creation_date,'%d.%m.%Y') AS creation_date_f,
            DATE_FORMAT(expected_delivery,'%d.%m.%Y') AS expected_delivery_f
       FROM applications
      WHERE user_id = ? AND status NOT IN ('Получено','Отклонена')
   ORDER BY id DESC`, [userId]);
}

export async function createApplication(
  userId,
  { productName, quantity, price, link, desiredDate },
) {
  return query(
    `INSERT INTO applications
            (user_id, product_name, quantity, price, link, desired_date, status)
     VALUES (?,?,?,?,?,?,?)`,
    [userId, productName, quantity, price, link, desiredDate, 'На рассмотрении'],
  );
}

export async function cancelApplication(id) {
  return query(
    'UPDATE applications SET status = ?, manager_comment = ? WHERE id = ?',
    ['Отклонена', 'Отменено пользователем', id],
  );
}

/* ─── админские выборки ─────────────────────────────────────── */
const ARCHIVE_STATUSES = ['Получено', 'Отклонена'];

export async function getAdminApplications(filter = 'Все') {
  let sql = `SELECT a.*, u.username,
                    DATE_FORMAT(a.desired_date,'%d.%m.%Y')  AS desired_date_f,
                    DATE_FORMAT(a.creation_date,'%d.%m.%Y') AS creation_date_f,
                    DATE_FORMAT(a.expected_delivery,'%d.%m.%Y') AS expected_delivery_f
               FROM applications a
               JOIN users u ON a.user_id = u.id
              WHERE a.status NOT IN (?, ?)`;
  const params = [...ARCHIVE_STATUSES];

  if (filter !== 'Все') {
    sql += ' AND a.status = ?';
    params.push(filter);
  }
  sql += ' ORDER BY a.id DESC';
  return query(sql, params);
}

export async function updateApplication(id, status, comment, expected) {
  return query(
    `UPDATE applications
        SET status = ?, manager_comment = ?, expected_delivery = ?
      WHERE id = ?`,
    [status, comment, expected || null, id],
  );
}

export async function getArchiveApplications() {
  return query(
    `SELECT a.*,
            u.username,
            (a.quantity * a.price) AS total_cost,
            DATE_FORMAT(a.desired_date,'%d.%m.%Y')  AS desired_date_f,
            DATE_FORMAT(a.creation_date,'%d.%m.%Y') AS creation_date_f,
            DATE_FORMAT(a.expected_delivery,'%d.%m.%Y') AS expected_delivery_f
       FROM applications a
       JOIN users u ON a.user_id = u.id
      WHERE a.status IN (?, ?)
   ORDER BY a.id DESC`,
    ARCHIVE_STATUSES,
  );
}

/* ─── пользователи ─────────────────────────────────────────── */
export async function getAllUsers() {
  return query('SELECT * FROM users');
}
