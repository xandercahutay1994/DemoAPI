'use strict'

const restify = require('restify')
const dbConfig  = require('./config')
const r = require('rethinkdb')

const server = restify.createServer()
server.use(restify.plugins.bodyParser()) //execute when route has been chosen to service the request

let connection = null
r.connect(dbConfig, (err, conn) => {
  if(err) throw err
  connection = conn
})

// ERROR HANDLER
const routeWrapper = route => async(req, res, next) => {
  try {
    await route(req, res)
  } catch({ status, message }) {
    res.send(status, { message })
  }
}

// const checkIfGroupCreator = ({ group_id, member_id: creator_id }) => {
//   return r.table('tbl_Group')
//     .get(group_id)('creator_id')
//     .eq(creator_id)
//     .default({})
//     .run(connection)
// }

/* USERS */

const createUser = async(req, res) => {
  const { body } = req
  
  if (!body.email) 
    throw { status: 400, message: 'Email is required' }
  if (!body.fname) 
    throw { status: 400, message: 'Firstname is required' }
  if (!body.lname) 
    throw { status: 400, message: 'Lastname is required' }

  const postData = {
    ...req.body,
    date_created: new Date().toISOString()
  }

  postData.id = await r.table('tbl_User')
                .insert(postData)
                .run(connection)
                .then(({ generated_keys: [id] }) => id)
  
  res.send(postData)
}

const getUserById = async(req, res) => {
  const result = await r.table('tbl_User').get(req.params.id).run(connection)

  if (!result)
    res.send('No User Found')
  else
    res.send(result)
}

const getAllUsers = async(req, res) => {
  const result = await r.table('tbl_User').coerceTo('array').run(connection)

  if (!result.length)
    res.send('No User(s) Found!')
  else
    res.send(result)
}

const updateUser = async(req, res) => {
  const { body } = req

  const result = await r.table('tbl_User')
                .get(body.id) 
                .update(body)
                .run(connection)

  if (result.replaced !== 1 && result.unchanged === 0) 
    res.send(400, 'Please check your id params!')
  else
    res.send(body)
}

const deleteUser = async(req, res) => {
  r.table('tbl_User')
    .get(req.params.id)
    .delete()
    .run(connection)
    .then(() => {
      res.send(200, { deleted: true })
    })
}

const getUserGroups = async(req, res) => {
  const { id } = req.params

  const result = await r.table('tbl_UserGroup')
                .filter(e => e('member_ids').contains(id))
                .merge(ee => r.table('tbl_Group').get(ee('group_id')))
                .coerceTo('array')
                .without('group_id',  'member_ids')
                .run(connection)  

  res.send(200, result)
}

const removeMemberFromGroup = async(req, res) => {
  const { params : { group_id, member_id } } = req

  r.table('tbl_UserGroup')
    .filter({ group_id })
    .coerceTo('array')
    .default([])
    .run(connection)
    .then(([e]) => {
      r.table('tbl_UserGroup')
        .update({
          ...e,
          member_ids: e.member_ids.filter(e => e !== member_id)
        })
        .run(connection)
        res.send({ deleted: true })
    })
}

/* END USERS */

/*  USER API */
server.post('/user', routeWrapper(createUser))
server.get('/user/:id', routeWrapper(getUserById))
server.get('/user', routeWrapper(getAllUsers))
server.put('/user', routeWrapper(updateUser))
server.del('/user/:id', routeWrapper(deleteUser))
server.get('/user/:id/group', routeWrapper(getUserGroups))
server.del('/user/:member_id/group/:group_id', routeWrapper(removeMemberFromGroup))
/* END OF USER API */


/* MESSAGE */

// CREATE/SEND MESSAGE EITHER TO USER OR GROUP
const createMessage = async(req, res) => {
  const { body } = req

  if (!body.message) 
    throw { status: 400, message: 'Message is required' }
  if (!body.sender_id)
    throw { status: 400, message: 'Sender Id is required' }
  if (!body.receiver_id)
    throw { status: 400, message: 'Receiver Id is required' }

  const postData = {
    ...req.body,
    date_created: new Date().toISOString()
  }

  postData.id = await r.table('tbl_Message')
                .insert(postData)
                .run(connection)
                .then(({ generated_keys: [id] }) => id)

  res.send(postData)

}

// GET ALL MESSAGES RECEIVED BY USER/GROUP
const getAllMessagesReceived = async(req, res) => {

  const result = await r.table('tbl_Message')
                .getAll(req.params.id, { index: 'receiver_id' })
                .merge(e => {
                  return r.table('tbl_User').get(e('sender_id'))
                })
                .coerceTo('array')
                .run(connection)

  if (!result.length)
    // throw new SyntaxError('Id is Incorrect')
    res.send('No conversation(s) yet!')
  else
    res.send(result)
}

const getConvoOfReceiverSender = async(req, res) => {
  const { params : { receiver_id, sender_id } } = req

  const result = await r.table('tbl_Message')
                .getAll(receiver_id, { index: 'receiver_id' })
                .filter({ sender_id })
                .union(
                  r.table('tbl_Message') 
                  .getAll(sender_id, { index: 'receiver_id' })
                  .filter({ sender_id: receiver_id })
                )
                .orderBy('date_created')
                .run(connection)

  if (!result.length)
    res.send(200, 'You have no conversation with this person yet')
  else 
    res.send(200, result)
}

const deleteSpecMessage = async(req, res) => {
  const { params, body : { sender_id, receiver_id } } = req

  const result = await r.table('tbl_Message')
                .get(params.message_id)
                .delete()
                .run(connection)

  if (result.deleted !== 1) {
    res.send('Nothing to delete')
  } else {
    const data = await r.table('tbl_Message')
                .getAll(receiver_id, { index: 'receiver_id' })
                // .filter({ sender_id })
                .coerceTo('array')
                .run(connection)

    res.send(data)
  } 
}

const deleteConvoRecSen = async(req, res) => {
  const { params : { sender_id, receiver_id } } = req

  const result = await r.table('tbl_Message')
                .getAll(receiver_id, { index: 'receiver_id' })
                .filter({ sender_id })
                .delete()
                .run(connection)

  if (result.deleted === 0)
    res.send('No conversation(s) deleted!')
  else 
    res.send({ deleted: true })
}
/* END MESSAGE */

/* MESSAGE API */
server.post('/message', routeWrapper(createMessage))
server.get('/message/receiver/:id', routeWrapper(getAllMessagesReceived))
server.get('/message/receiver/:receiver_id/sender/:sender_id', routeWrapper(getConvoOfReceiverSender))
server.del('/message/:message_id', routeWrapper(deleteSpecMessage))
server.del('/message/user/:receiver_id/sender/:sender_id', routeWrapper(deleteConvoRecSen))

/* END OF MESSAGE API */

/* GROUP */
const createGroup = async(req, res) => {
  const { body } = req
  
  if (!body.group_name)
    throw { status: 400, message: 'Group Name is Required' }
  if (!body.creator_id)
    throw { status: 400, message: 'Creator Id is Required' }

  const checkUser = await r.table('tbl_User').coerceTo('array').run(connection)
  
  if (!checkUser.length)
    res.send('Cant create group if there is no User Created!')

  const postData = {
    ...req.body,
    date_created: new Date().toISOString(),
    status: 'Active'
  }

  postData.id = await r.table('tbl_Group')
                .insert(postData)
                .run(connection)
                .then(({ generated_keys: [id] }) => id)

  const userGroupId = await r.table('tbl_UserGroup')
                    .insert({
                      group_id: postData.id,
                      member_ids: [postData.creator_id]
                    })
                    .run(connection)
                    .then(({ generated_keys: [id] }) => id)

  res.send(200, {
    id: userGroupId,
    ...postData
  })     
}

const addUserToGroup = async(req, res) => {
  const { params, body : { member_id, user_id } } = req

  if (!body.member_id)
    throw { status: 400, message: 'Member Id is Required' }
  if (!body.user_id)
    throw { status: 400, message: 'User Id is Required' }

  const isUserInGroup = await r.table('tbl_UserGroup')
                      .filter({ group_id: params.id })
                      .pluck('member_ids')
                      .map(e => e('member_ids').contains(member_id))
                      .nth(0)
                      .run(connection)

  if (!isUserInGroup) {
    throw { status: 401, message: 'Cant add if you are not a member of this Group!' }
  } else {
    const member_ids = await r.table('tbl_UserGroup')
                  .filter({ group_id: params.id })
                  .coerceTo('array')
                  .run(connection)
                  // .then(([e]) => e.member_ids)
                  .then(([e]) => [ ...e.member_ids, user_id ])

    r.table('tbl_UserGroup')
      .filter({ group_id: params.id })
      // .merge(r.table('tbl_User').get('25bde1f3-07d7-4f8c-b8e1-b908ecbf9458'))
      .update({ member_ids })
      .run(connection)
      .then(()=> res.send({ 
        id: params.id,
        member_ids
      }))
  }
}

const getUsersOfSpecGroup = async(req, res) => {
  const result = await r.db('demo_db').table('tbl_UserGroup')
                .filter({ group_id: req.params.id })
                .merge(e =>
                    e('member_ids').map(ee => 
                      r.table('tbl_User').get(ee)
                    )
                )
                .nth(0)
                .default([])
                .run(connection)

  res.send(200, result)
}
/* END GROUP */

/* GROUP API */

server.post('/group', routeWrapper(createGroup))
server.put('/group/:id/user', routeWrapper(addUserToGroup))
server.get('/group/:id', routeWrapper(getUsersOfSpecGroup)) // ALL USERS OF SPECIFIC GROUP

/* END GROUP API */

server.get('/*', (req, res) => {
  res.send(404, '404 not found')
})

server.listen(3000, ()=> console.log(`server running on ${server.url}`))

  