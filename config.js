const r = require('rethinkdb')

const dbConfig = {
    host: 'localhost',
    port: '28015',
    db: 'demo_db'
}

// const b = serverConnection.then(d => d)
// console.log('serverConnection: ', serverConnection);

// console.log(connection);
module.exports = dbConfig
