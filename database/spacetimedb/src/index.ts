import { schema, table, t } from 'spacetimedb/server';

const spacetimedb = schema({
  person: table(
    { public: false },
    {
      userid: t.string().primaryKey(),
      passhash: t.string(),
    },
  ),
  storage:table(
    { public: true },
    {
      owner_key: t.string().primaryKey(),
      value: t.string(),
    }
  ),
  published: table(
    { public: true },
    {
      owner: t.string(),
      module: t.string(),
      version: t.string(),
    }
  )
});

export default spacetimedb;
export const init = spacetimedb.init(_ctx => {});
export const onConnect = spacetimedb.clientConnected(_ctx => {});
export const onDisconnect = spacetimedb.clientDisconnected(_ctx => {});

type SignupResult = {tag:"success" | "err"}
let ok:SignupResult = {tag:"success"}
let err:SignupResult = {tag:"err"}
export const signup = spacetimedb.procedure(
  {userid: t.string(), passhash:t.string()},
  t.enum("SignupResult", ["success", "err"]),
  (ctx, {userid, passhash})=> ctx.withTx(c=>{
    let prev = c.db.person.userid.find(userid)
    if (prev) return prev.passhash == passhash ? ok : err
    c.db.person.insert({userid, passhash})
    return ok
  })
)

export const changePassword = spacetimedb.procedure(
  { userid: t.string(), passhash: t.string(), newPasshash: t.string() },
  t.enum("changePasswordResult", ["success", "err"]),
  (ctx, { userid, passhash, newPasshash }) => ctx.withTx(c=>{
    let prev = c.db.person.userid.find(userid)
    if (!prev || prev.passhash != passhash) return err
    c.db.person.userid.update({userid, passhash: newPasshash})
    return ok
  })
)

const checkAuth = (c:any, owner:string, passhash:string) => {
  let prev = c.db.person.userid.find(owner)
  if (!prev || prev.passhash != passhash) return false
  return true
}

const mkkey = (owner:string, key:string) => owner.replaceAll(":", "_:") + ":" + key
export const setitem = spacetimedb.procedure(
  {owner: t.string(), passhash: t.string(), key: t.string(), value: t.string()},
  t.enum("setResult", ["success", "err"]),
  (ctx, { owner, passhash, key, value }) => ctx.withTx(c=>{
    if (!checkAuth(c, owner, passhash)) return err
    let owner_key = mkkey(owner, key)
    let prev_item = c.db.storage.owner_key.find(owner_key)
    if (prev_item) c.db.storage.owner_key.update({owner_key, value})
    else c.db.storage.insert({ owner_key, value })
    return ok
  })
)

export const publish = spacetimedb.procedure(
  {owner: t.string(), passhash:t.string(), module: t.string(), version: t.string(), del: t.bool()},
  t.enum("publishResult", ["success", "err"]),
  (ctx, {owner, passhash, module, version, del})=> ctx.withTx(c=>{
    if (!checkAuth(c, owner, passhash)) return err
    if (del) c.db.published.delete({owner, module, version})
    else c.db.published.insert({owner, module, version})
    return ok
  })
)