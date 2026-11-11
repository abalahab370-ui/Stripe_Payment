const pg = require ("pg")

//init the connection with the database in supabase using pg 

const pool = new pg.Pool ( {
      connectionString : process.env.CONNECTION_STRING , // we use it inorder to connect to the database with a using string that must stay secret !
      max : 15 , //well this one must deal with it carfully cause evey connection take like 10mb in order to setup so since we gonna run on free tier it like 15 * 10 = 150 mb of 500mb so we leave 350 free to use by the database so it dont get slow with meduim use )=) 
      idleTimeoutMillis: 30000, // Close idle connections after 30s
      connectionTimeoutMillis: 5000,
      ssl : {
                  rejectUnauthorized : false //required for supabase connection !
            }
} );

const query = async  ( text , params ) => {
      return await pool.query(text , params) ;
}

// Transaction helper with automatic connection handling & rollback safety
async function withTransaction(callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}


const testConnection = async () => {
      try {
            const result = await query (`SELECT NOW()`) ; // test the connection to the database
            console.log('Database connection test passed:', result.rows[0]);
      } catch (error) {
            console.error('Error testing database connection:', error);
      }
}
testConnection() ; // test the connection to the database


module.exports = { pool, query, withTransaction };