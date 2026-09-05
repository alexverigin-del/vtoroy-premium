#!/usr/bin/env node

const apply = process.argv.includes('--apply');
if (process.argv.slice(2).some(arg => arg !== '--apply')) throw new Error('Usage: node scripts/configure_telegram_bot_profile.mjs [--apply]');
const token = String(process.env.TELEGRAM_BOT_TOKEN || '').trim();
if (!/^\d+:[A-Za-z0-9_-]{20,}$/.test(token)) throw new Error('TELEGRAM_BOT_TOKEN_REQUIRED');

const description = 'Поможем подобрать устройство, продать или обменять технику, задать вопрос менеджеру и продолжить заявку. По желанию можно подписаться на поступления, снижение цен, новости и акции';
const shortDescription = 'Заявки, поддержка и новости I СВОИ';
const commands = [
  {command:'start',description:'Главное меню'},
  {command:'new',description:'Новое обращение'},
  {command:'dialogs',description:'Мои заявки'},
  {command:'news',description:'Подписки'},
  {command:'help',description:'Информация о боте'},
];
const base=`https://api.telegram.org/bot${token}`;
async function call(method,body={}) {
  const response=await fetch(`${base}/${method}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(15000)});
  const data=await response.json();
  if(!response.ok||data.ok!==true) throw new Error(`TELEGRAM_${method.toUpperCase()}_${response.status}`);
  return data.result;
}
async function snapshot() {
  return {
    description:await call('getMyDescription',{language_code:'ru'}),
    shortDescription:await call('getMyShortDescription',{language_code:'ru'}),
    commands:await call('getMyCommands',{scope:{type:'all_private_chats'},language_code:'ru'}),
    menu:await call('getChatMenuButton'),
  };
}
if(apply) {
  for(const language_code of [undefined,'ru']) {
    await call('setMyDescription',{description,...(language_code?{language_code}:{})});
    await call('setMyShortDescription',{short_description:shortDescription,...(language_code?{language_code}:{})});
    await call('setMyCommands',{commands,scope:{type:'all_private_chats'},...(language_code?{language_code}:{})});
  }
  await call('setChatMenuButton',{menu_button:{type:'commands'}});
}
const current=await snapshot();
const ready=current.description?.description===description && current.shortDescription?.short_description===shortDescription &&
  JSON.stringify(current.commands)===JSON.stringify(commands) && current.menu?.type==='commands';
console.log(JSON.stringify({mode:apply?'apply':'check',ready,description:Boolean(current.description?.description),shortDescription:Boolean(current.shortDescription?.short_description),commands:current.commands?.map(item=>item.command)||[],menu:current.menu?.type||null},null,2));
if(!ready) process.exitCode=2;
