'use strict'

const restify = require('restify')
const Users = require('./controllers/Users')
const dbConfig  = require('./config')
const r = require('rethinkdb')

const server = restify.createServer()
server.use(restify.plugins.bodyParser())

let connection = null
r.connect(dbConfig, (err, conn) => {
  if(err) throw err
  connection = conn
})

/*
    USER ROUTES
*/

// GET REQUESTS
server.get('/getAllUsers', (req, res) => {
    r.table('tbl_User').coerceTo('array').run(connection).then(data => res.send(200, data))
})

// POST REQUESTS
server.post('/createUser', (req, res) => {
    r.table('tbl_User')
        .insert(req.body)
        .run(connection)
        .then(({ generated_keys: [id] }) => {
            res.send(200, {
                id,
                ...req.body
            })
        })
        .catch(err => res.send(500, err))
})






server.get('/*', (req, res) => {
    res.send(404, '404 not found')
})

server.listen(3000, ()=> console.log(`server running on ${server.url}`))
