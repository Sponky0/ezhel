const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');const {test}=require('node:test');const setup=require('./fixtures/database.cjs');
test('database permissions and atomic business operations',async t=>{const db=await setup();t.after(()=>db.close());
for (const file of fs.readdirSync(path.join(__dirname,'../supabase/migrations')).filter(x=>/^003[0-3]_/.test(x)).sort()) await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations',file),'utf8'));
const a='11111111-1111-4111-8111-111111111111', b='22222222-2222-4222-8222-222222222222', c='33333333-3333-4333-8333-333333333333';
for (const [id,name] of [[a,'alice'],[b,'bob'],[c,'carol']]) await db.query('insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3)',[id,name+'@example.invalid',JSON.stringify({username:name,country:'TR',age:25,gender:'female',hobbies:['music']})]);
async function as(id,fn,role='authenticated') { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role',$2,false)",[id,role]);await db.exec('set role '+role);try{return await fn();}finally{await db.exec('reset role');}}
const q=(sql,params=[])=>db.query(sql,params);
const balance=async id=>(await q('select diamonds from profiles where id=$1',[id])).rows[0].diamonds;
const conv=(await as(a,()=>q('select * from find_or_create_conversation($1)',[b]))).rows[0].conversation_id;
await t.test('signup preserves onboarding without auto-confirming or trusting role metadata',async()=>{
 assert.equal((await q('select email_confirmed_at from auth.users where id=$1',[a])).rows[0].email_confirmed_at,null);
 const p=(await q('select * from profiles where id=$1',[a])).rows[0];assert.equal(p.age,25);assert.equal(p.country,'TR');assert.equal(p.role,'user');assert.equal(p.email_verified_at,null);
 await q('update auth.users set email_confirmed_at=now() where id=$1',[a]);assert.ok((await q('select email_verified_at from profiles where id=$1',[a])).rows[0].email_verified_at);
});
await t.test('normal profile edits work; direct balance, admin, boost and badge changes fail',async()=>{
 const before=(await q('select edit_version from profiles where id=$1',[a])).rows[0].edit_version;
 await as(a,()=>q("update profiles set bio='draft saved' where id=$1",[a]));assert.ok(Number((await q('select edit_version from profiles where id=$1',[a])).rows[0].edit_version)>Number(before));
 for(const edit of ["diamonds=100000","role='admin'","is_highlighted=true","email_verified_at=now()"]){await assert.rejects(as(a,()=>q('update profiles set '+edit+' where id=$1',[a])));}
});
await t.test('boost is atomic, fixed duration and idempotent under replay',async()=>{
 await q('update profiles set diamonds=1000 where id=$1',[a]);const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 const first=await as(a,()=>q('select boost_profile($1) result',[id]));const after=await balance(a);assert.ok(after<1000);
 const again=await as(a,()=>q('select boost_profile($1) result',[id]));assert.deepEqual(first.rows,again.rows);assert.equal(await balance(a),after);
 await assert.rejects(as(a,()=>q('select highlight_profile(9999)')));
 await q('update profiles set diamonds=0 where id=$1',[c]);await assert.rejects(as(c,()=>q('select boost_profile(gen_random_uuid())')));assert.equal(await balance(c),0);
});
await t.test('unverified purchase RPCs cannot mint currency; verified purchase credits exactly once',async()=>{
 await assert.rejects(as(a,()=>q('select buy_diamonds(5000,0::numeric)')));
 const pkg=(await q('select id from diamond_packages limit 1')).rows[0].id;
 await q("update diamond_packages set store_product_id='test.coins',amount=100 where id=$1",[pkg]);
 const args=['evt-one','tx-one','PLAY_STORE',a,'test.coins','PRODUCTION'];
 await assert.rejects(as(a,()=>q('select credit_verified_purchase($1,$2,$3,$4,$5,$6)',args)));
 const before=await balance(a);await as('',()=>q('select credit_verified_purchase($1,$2,$3,$4,$5,$6)',args),'service_role');assert.equal(await balance(a),before+100);
 await as('',()=>q('select credit_verified_purchase($1,$2,$3,$4,$5,$6)',args),'service_role');
 await as('',()=>q('select credit_verified_purchase($1,$2,$3,$4,$5,$6)',['evt-two',...args.slice(1)]),'service_role');assert.equal(await balance(a),before+100);
 await assert.rejects(as('',()=>q('select credit_verified_purchase($1,$2,$3,$4,$5,$6)',['evt-test','tx-test','PLAY_STORE',a,'test.coins','SANDBOX']),'service_role'));
 assert.equal(await balance(a),before+100);
});
await t.test('Instagram stays private, only a verified debit unlocks it, replay is free',async()=>{
 await as(b,()=>q("insert into instagram_accounts(user_id,handle) values($1,'test.bob')",[b]));
 assert.equal((await as(a,()=>q('select * from instagram_accounts where user_id=$1',[b]))).rows.length,0);
 const before=await balance(a);const result=await as(a,()=>q('select unlock_instagram($1) url',[b]));assert.equal(result.rows[0].url,'https://www.instagram.com/test.bob/');assert.equal(await balance(a),before-20);
 await as(a,()=>q('select unlock_instagram($1)',[b]));assert.equal(await balance(a),before-20);
 await assert.rejects(as(c,()=>q('select unlock_instagram($1)',[b])));assert.equal((await q('select * from instagram_unlocks where viewer_id=$1',[c])).rows.length,0);
});
await t.test('followers can be changed only by their owner',async()=>{
 await as(a,()=>q('insert into follows(follower_id,following_id) values($1,$2)',[a,b]));
 await assert.rejects(as(c,()=>q('insert into follows(follower_id,following_id) values($1,$2)',[a,c])));
 const r=await as(a,()=>q('select social_summary($1) result',[b]));assert.equal(r.rows[0].result.followers,1);
 assert.equal((await as(c,()=>q('delete from follows where follower_id=$1 returning *',[a]))).rows.length,0);
});
let once,kept;
await t.test('private media cannot be downloaded through client storage or database paths',async()=>{
 for(const mode of ['once','keep']){
  const id=mode==='once'?'dddddddd-dddd-4ddd-8ddd-dddddddddddd':'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';const file=a+'/'+id+'.jpg';
  await as(a,()=>q("insert into storage.objects(bucket_id,owner,name) values('private_chat',$1,$2)",[a,file]));
  assert.equal((await as(b,()=>q("select * from storage.objects where name=$1",[file]))).rows.length,0);
  const r=await as(a,()=>q('select send_private_media($1,$2,$3,$4,$5,$6) id',[conv,file,'image',mode,'gallery',id]));
  const replay=await as(a,()=>q('select send_private_media($1,$2,$3,$4,$5,$6) id',[conv,file,'image',mode,'gallery',id]));assert.deepEqual(r.rows,replay.rows);
  if(mode==='once')once=r.rows[0].id;else kept=r.rows[0].id;
 }
 await assert.rejects(as(a,()=>q('select * from message_media')));
 await assert.rejects(as(b,()=>q('select claim_message_media($1,$2)',[once,b])));
});
await t.test('once access is server-enforced; sender view does not consume recipient view',async()=>{
 await assert.rejects(q('select claim_message_media($1,$2)',[once,c]));
 await q('select claim_message_media($1,$2)',[once,a]);await q('select claim_message_media($1,$2)',[once,b]);await assert.rejects(q('select claim_message_media($1,$2)',[once,b]));
 await q('select claim_message_media($1,$2)',[kept,b]);await q('select claim_message_media($1,$2)',[kept,b]);
});
await t.test('outsiders cannot read conversation messages; blocks deny new media access',async()=>{
 assert.equal((await as(c,()=>q('select * from messages where conversation_id=$1',[conv]))).rows.length,0);
 await as(b,()=>q('insert into blocks(blocker_id,blocked_id) values($1,$2)',[b,a]));await assert.rejects(q('select claim_message_media($1,$2)',[kept,a]));
 const list=await as(b,()=>q('select * from blocked_accounts()'));assert.equal(list.rows[0].id,a);
 await as(b,()=>q('delete from blocks where blocker_id=$1',[b]));
});
await t.test('push token transfer and logout cannot leave previous account registered',async()=>{
 const token='ExpoPushToken[test_token]';await as(a,()=>q('select register_push_token($1)',[token]));await as(b,()=>q('select register_push_token($1)',[token]));
 assert.equal((await q('select expo_push_token from profiles where id=$1',[a])).rows[0].expo_push_token,null);
 await as(a,()=>q('select unregister_push_token($1)',[token]));assert.equal((await q('select expo_push_token from profiles where id=$1',[b])).rows[0].expo_push_token,token);
 await as(b,()=>q('select unregister_push_token($1)',[token]));assert.equal((await q('select expo_push_token from profiles where id=$1',[b])).rows[0].expo_push_token,null);
});
await t.test('DM creation cannot trigger fake matching; confirmed matches need both users and deduplicate',async()=>{
 assert.equal((await q("select 1 from pg_trigger where tgname='on_conversation_participant_inserted_push'")).rows.length,0);
 const id='ffffffff-ffff-4fff-8fff-ffffffffffff';assert.equal((await as(a,()=>q('select confirm_match($1,$2) ok',[b,id]))).rows[0].ok,false);
 await assert.rejects(as(c,()=>q('select confirm_match($1,$2)',[a,id])));
 assert.equal((await as(b,()=>q('select confirm_match($1,$2) ok',[a,id]))).rows[0].ok,true);
 assert.equal((await as(b,()=>q('select confirm_match($1,$2) ok',[a,id]))).rows[0].ok,false);
});
await t.test('story reply context comes from server story rather than arbitrary client preview',async()=>{
 const story=(await as(b,()=>q("insert into stories(user_id,media_url) values($1,'https://example.invalid/story.jpg') returning id",[b]))).rows[0].id;
 const mid=(await as(a,()=>q("select send_story_reply($1,'hello') id",[story]))).rows[0].id;
 assert.equal((await as(b,()=>q('select story_preview_url from messages where id=$1',[mid]))).rows[0].story_preview_url,'https://example.invalid/story.jpg');
});

await t.test('private typing channel policies reject outsiders and allow both participants',async()=>{
 await db.exec('grant usage on schema realtime to authenticated; grant select,insert on realtime.messages to authenticated');
 await q("select set_config('test.topic',$1,false)",['typing:'+conv]);
 await as(a,()=>q('insert into realtime.messages(id) values(1)'));assert.equal((await as(b,()=>q('select * from realtime.messages'))).rows.length,1);
 assert.equal((await as(c,()=>q('select * from realtime.messages'))).rows.length,0);await assert.rejects(as(c,()=>q('insert into realtime.messages(id) values(2)')));
});
});

test('reviewable deployment bundle applies atomically and rejects accidental replay',async t=>{
 const db=await setup();t.after(()=>db.close());const sql=fs.readFileSync(path.join(__dirname,'../supabase/patches/real-user-report.sql'),'utf8');
 await db.exec(sql);assert.equal((await db.query('select count(*)::int n from public.napan_patch_history')).rows[0].n,1);
 await assert.rejects(db.exec(sql),/already applied/);await db.exec('rollback');
 assert.equal((await db.query('select count(*)::int n from public.napan_patch_history')).rows[0].n,1);
});
