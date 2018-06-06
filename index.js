/**
* Created by rkkky on 2018-05-21.
*/
const Command = require('command')
const Long = require("long")
const config = require('./config.json')
const regionConfig = require('../../config.json')
const log = require('./logger')
const xmldom = require('xmldom')
const fs = require('fs')
const path = require('path')
const UI = require('ui')

String.prototype.clr = function (hexColor) { return `<font color='#${hexColor}'>${this}</font>` }

const errorHandler = {
  warning(msg) {
    log.warn({ err: msg }, 'xml parser warning');
  },

  error(msg) {
    log.error({ err: msg }, 'xml parser error');
  },

  fatalError(msg) {
    log.error({ err: msg }, 'xml parser fatal error');
  },
};

module.exports = function DPS(d) {

  const command = Command(d)

  let enable = config.enable,
  notice = config.notice,
  notice_damage = config.notice_damage,
  debug = config.debug,
  region = regionConfig.region


  let mygId,
  myplayerId= '',
  gzoneId = new Array(),
  gmonsterId = new Array(),
  boss = new Set(),
  bosses = new Array(),
  NPCs = new Array(),
  party = new Array(),
  dpsHistory = '',
  lastDps= '',
  currentbossId = '',
  partydamage = new Long(0,0),
  missingDamage = new Long(0,0),
  enraged = false
  var filename = path.join(__dirname, '/monsters/monsters-'+ region + '.xml')
  var doc = null
  const ui = UI(d)
  var counter = 0

  ui.use(UI.static(__dirname + '/ui'))

  ui.get('/api/R', (req, res) => {
    counter++
    res.status(200).json(membersDps(currentbossId));
  })

  d.hook('S_LOGIN',10, (e) => {
    mygId=e.gameId.toString()
    myplayerId=e.playerId.toString()
    myname=e.name.toString()
    //log('gameId:' + mygId)
    party = []
    putMeInParty()
  })

  d.hook('S_SPAWN_ME',2, (e) => {
    mygId=e.gameId.toString()
    //console.log(e)
    currentbossId = ''
    bosses = []
    NPCs = []
    ui.open()
  })

  function putMeInParty()
  {
    newmember = {
      'gameId' : mygId,
      'playerId' : myplayerId,
      'name' : myname,
      'class' : '',
      'targetId'  :  'NONE',
      'damage'  :  'NONE',
      'critDamage' : 'NONE'
    }

    if(!isPartyMember(mygId)) {
      party.push(newmember)
    }
  }


  d.hook('S_LOAD_TOPO',3, (e) => {
    currentZone = e.zone
  })

  //Boss Monsters
  d.hook('S_BOSS_GAGE_INFO',3, (e) => {
    if (!enable) return
    // notified boss before battle
    hpMax = e.maxHp
    hpCur = e.curHp
    partydamage = e.maxHp.sub(e.curHp) // Long
    hpPer = Math.floor((hpCur / hpMax) * 100)

    if(!isBoss(e.id.toString())){
      newboss = {
        'bossId' : e.id.toString(),
        'huntingZoneId' : e.huntingZoneId,
        'templateId' : e.templateId,
        'curHp' : e.maxHp.toString(),
        'maxHp' : e.curHp.toString(),
        'partydamage' : partydamage.toString(),
        'battlestarttime' : 0,
        'battleendtime' : 0
      }
      bosses.push(newboss)
    }
    else{
      id=e.id.toString()
      for(i in bosses){
        if(id.localeCompare(bosses[i].bossId) == 0)
        {
          bosses[i].curHp = e.maxHp.toString()
          bosses[i].maxHp = e.curHp.toString()
          bosses[i].partydamage = partydamage.toString()
        }
      }
    }
  })

  d.hook('S_SPAWN_NPC',8, (e) => {
    if (!enable) return
    newNPC = {
      'gameId' : e.gameId.toString(),
      'owner' : e.owner.toString(),
      'name' : e.npcName
    }
    //log('S_SPAWN_NPC : '+ newNPC.name +' newNPC.gameId ' + newNPC.gameId +' newNPC.owner '+ newNPC.owner);
    NPCs.push(newNPC)
  })


  function isMemberPet(gid)
  {
    for( i in party )
    {
      if(party[i].gameId.localeCompare(gid) == 0 ) {
        //log('isMemberPet ' + party[i].gameId + ' ' + gid)
        return true
      }
    }
    return false
  }


  d.hook('S_DESPAWN_NPC',3, (e) => {
    if (!enable) return
    id = e.gameId.toString()
    bossindex = getBossIndex(id)
    if( bossindex >= 0 && bosses[bossindex].battleendtime == 0){
      bosses[bossindex].battleendtime = Date.now()
      tmp = membersDps(id)
      dpsHistory += tmp
      lastDps=tmp
      enraged = false
      bosses.splice(bossindex,1)
    }
    for(i in NPCs){
      if(NPCs[i].gameId.localeCompare(id) == 0) {
        NPCs.splice(i,1)
      }
    }

  })

  d.hook('S_NPC_STATUS',1, (e) => {
    if (!enable) return
    if(!isBoss(e.creature.toString())) return
    if (e.enraged === 1 && !enraged) {
      enraged = true
    } else if (e.enraged === 0 && enraged) {
      if (hpPer === 100) return
      enraged = false
    }
  })

  //party handler
  d.hook('S_LEAVE_PARTY_MEMBER',2,(e) => {
    id = e.playerId.toString()
    for(i in party){
      if(id.localeCompare(party[i].playerId) == 0) party.splice(i,1)
    }
  })

  d.hook('S_LEAVE_PARTY',1, (event) => {
    party= []
    putMeInParty()
  })

  d.hook('S_PARTY_MEMBER_LIST',6,(event) => {
    party = []
    event.members.forEach(member => {
      newmember = {
        'gameId' : member.gameId.toString(),
        'playerId' : member.playerId.toString(),
        'name' : member.name.toString(),
        'class' : member.class.toString(),
        'targetId'  :  'NONE',
        'damage'  :  'NONE',
        'critDamage' : 'NONE'
      }
      if(!isPartyMember(member.gameId.toString())) {
        //log('S_PARTY_MEMBER_LIST :' + newmember.name)
        party.push(newmember)
      }
    })
  })

  // damage handler : Core
  d.hook('S_EACH_SKILL_RESULT',6, (e) => {
    if (!enable) return

    memberIndex = getPartyMemberIndex(e.source.toString())
    sourceId = e.source.toString()
    if(memberIndex < 0){
      // projectile
      ownerIndex = getPartyMemberIndex(e.owner.toString())
      if(ownerIndex >= 0) {
        memberIndex = ownerIndex
        sourceId = e.owner.toString()
      }
      else{// pet
        petIndex=getMemberIndexOutofNPCBySid(e.source.toString(),e.owner.toString())
        if(petIndex >= 0) {
          //log( 'NOT missgindamage SID :' + e.source.toString() + ' owner :' + e.owner.toString() +' damage :' + e.damage.toString() )
          memberIndex = petIndex
          sourceId = party[memberIndex].gameId
        }
      }
    }
    target = e.target.toString()
    if(memberIndex >= 0  && e.damage > 0 && isBoss(target) ){
      addMemberDamage(sourceId,target,e.damage.toString(),e.crit)
      if(mygId.localeCompare(sourceId) == 0 && e.damage.gt(notice_damage)) {
        toNotice(myDps(memberIndex,e.damage,target))
        //e.damage=0
        //return true
      }
    }

  })



  fs.readFile(filename, "utf-8", function (err,data)
  {
    if (err) {
      return log(err);
    }
    const parser = new xmldom.DOMParser({ errorHandler });
    doc = parser.parseFromString(data, 'text/xml');
    if (!doc) {
      log('ERROR xml doc')
      return;
    }
    //log(findZoneMonster(720,3000))
  });

  function findZoneMonster(zoneId,monsterId)
  {
    if(!Number.isInteger(zoneId) || !Number.isInteger(monsterId)){
      log('no Integer' +zoneId + ':' + monsterId )
      return ''
    }

    if(gzoneId[zoneId] == 'undefined' || gzoneId[zoneId] == null) gzoneId[zoneId] = doc.getElementById(zoneId).getAttribute("name")

    if(gmonsterId[monsterId] == 'undefined' || gmonsterId[monsterId] == null) {

      try{
        element=doc.getElementById(zoneId)
        if (element.lengh == 0 ) throw "element array is 0"
        var mon = element.getElementsByTagName("Monster")
        if (mon.lengh == 0 ) throw "mon array is 0"
        for(i in mon)
        {
          if(mon[i].getAttribute("id") == monsterId) {
            //console.log(mon[i].getAttribute("name"))
            gmonsterId[monsterId] = mon[i].getAttribute("name")
            break
          }
        }
      }
      catch(err){
        log('ERROR :' + err)
        log('ERROR :' + zoneId +':'+ monsterId)
        console.log(element)
        console.log(mon)
        gmonsterId[monsterId] = 'UNDEFINED'
        return monsterId.toString() + ':' +zoneId.toString()
      }
    }
    return gmonsterId[monsterId] + ':' +gzoneId[zoneId]
  }

  function getMemberIndexOutofNPCBySid(sid,oid)
  {
    for(i in party){
      for(j in NPCs){
        if(NPCs[j].owner.localeCompare(party[i].gameId) == 0){
          if(NPCs[j].gameId.localeCompare(sid) == 0) return i
          if(NPCs[j].gameId.localeCompare(oid) == 0) return i
        }
      }
    }
    return -1
  }

  function getBosspartyDamage(id)
  {
    for(i in bosses){
      if(id.localeCompare(bosses[i].bossId) == 0) return bosses[i].partydamage
    }
    log('getBosspartyDamage Error')
    return '0'
  }

  function isBoss(gId)
  {
    for(i in bosses){
      if(gId.localeCompare(bosses[i].bossId) == 0) return true
    }
    return false
  }

  function getBossIndex(gId){
    for(i in bosses){
      //log('getBossIndex ' + gId + ' ' + bosses[i].bossId )
      if(gId.localeCompare(bosses[i].bossId) == 0) return i
    }
    //log('return -1')
    return -1
  }


  function getNpcName(bossId)
  {
    for(i in NPCs){
      //log('getNpcName bossId ' + bossId + ' NPCs gameId' + NPCs[i].gameId + ' ' + NPCs[i].name)
      if(bossId.localeCompare(NPCs[i].gameId) == 0) return NPCs[i].name
    }
    return 'NONAME'
  }

  function isPartyMember(gid){
    for(i in party){
      if(gid.localeCompare(party[i].gameId) == 0) return true
    }
    return false
  }

  function getPartyMemberIndex(id){
    for(i in party){
      if(id.localeCompare(party[i].gameId.valueOf()) == 0) return i
    }
    return -1
  }

  function getPartyMemberDamage(pgid)
  {
    id = pgid.toString()
    for(i in party){
      if(pgid.localeCompare(party[i].gameId.valueOf()) == 0) return party[i].damage
    }
    log("getDamage Error : can't find the same id")
    return 0
  }

  function addMemberDamage(id,target,damage,crit)
  {
    bossindex = getBossIndex(target)
    if( bossindex >= 0 && bosses[bossindex].battlestarttime == 0){
      bosses[bossindex].battlestarttime = Date.now()
      currentbossId = target
      //log('addMemberDamage' + id + ' ' + target + ' ' + damage)
    }

    //tdamage = new Long.fromString(getPartyMemberDamage(id).toString())
    for(i in party){
      if(id.localeCompare(party[i].gameId) == 0) {
        if(party[i].targetId.localeCompare(target) == 0)
        {
          //party[i].damage = tdamage.add(damage).toString()
          party[i].damage = Long.fromString(damage).add(party[i].damage).toString()
          if(crit) party[i].critDamage = Long.fromString(party[i].critDamage).add(damage).toString()
        }
        else{ // new monster
          party[i].battlestarttime = Date.now()
          party[i].targetId = target
          party[i].damage = damage
          if(crit) party[i].critDamage = damage
          else party[i].critDamage = "0"
        }
      }
    }
  }

  function membersDps(targetId)
  {
    var newLine = '\n'
    var endtime = 0
    var dpsmsg = newLine
    var bossIndex = -1
    var tdamage = new Long(0,0)
    var cdamage = new Long(0,0)
    var totalPartyDamage = new Long(0,0)
    bossIndex = getBossIndex(targetId)
    if(bossIndex < 0) return lastDps

    //totalPartyDamage = Long.fromString(bosses[bossIndex].partydamage)

    if( bosses[bossIndex].battleendtime == 0) endtime=Date.now()
    else endtime=bosses[bossIndex].battleendtime

    if(bosses[bossIndex].battlestarttime == 0 ) battleduration = 0
    else battleduration = Math.floor((endtime-bosses[bossIndex].battlestarttime) / 1000)

    var minutes = Math.floor(battleduration / 60)
    var seconds = Math.floor(battleduration % 60)

    dpsmsg = findZoneMonster(bosses[bossIndex].huntingZoneId,bosses[bossIndex].templateId)  + ' ' + minutes + ':' + seconds + newLine
    dpsmsg = dpsmsg.clr('E69F00')

    party.sort(function(a,b) {return (Number(a.damage) < Number(b.damage)) ? 1 : ((Number(b.damage) < Number(a.damage)) ? -1 : 0);} );

    var cname
    var dps=0

    for(i in party){
      if( battleduration <= 0 || targetId.localeCompare(party[i].targetId) != 0) continue
        totalPartyDamage = totalPartyDamage.add(party[i].damage)
    }

    //log(bosses[bossIndex].partydamage + ' : ' +totalPartyDamage.toString())

    dpsmsg += '<table>'
    for(i in party){
      if( totalPartyDamage.equals(0) || battleduration <= 0 || targetId.localeCompare(party[i].targetId) != 0) continue
      tdamage = Long.fromString(party[i].damage)
      cdamage = Long.fromString(party[i].critDamage)

      cname=party[i].name
      if(party[i].gameId.localeCompare(mygId) == 0) cname=cname.clr('00FF00')

      dps = (tdamage.div(battleduration).toNumber()/1000).toFixed(1)
      dps = numberWithCommas(dps)

      dpsmsg += '<tr><td>' + cname + '</td><td> ' + dps + 'k/s '.clr('E69F00') + '</td>'
      + '<td>' + tdamage.shr(10).multiply(1000).div(totalPartyDamage.shr(10)).toNumber()/10  + '% '.clr('E69F00') + '</td>'
      + '<td>' + cdamage.shr(10).multiply(1000).div(tdamage.shr(10)).toNumber()/10  + '% '.clr('E69F00') + '</td></tr>'+ newLine
    }
    dpsmsg += '</table>'
    lastDps = dpsmsg
    return dpsmsg
  }

  function myDps(i,damage,targetId)
  {

    var endtime = 0
    var dpsmsg = ''
    var bossIndex = -1
    var tdamage = new Long(0,0)
    var totalPartyDamage  = new Long(0,0)
    var dps=0

    bossIndex = getBossIndex(targetId)
    //totalPartyDamage = Long.fromString(bosses[bossIndex].partydamage)

    if( bosses[bossIndex].battleendtime == 0) endtime=Date.now()
    else endtime=bosses[bossIndex].battleendtime
    battleduration = Math.floor((endtime-bosses[bossIndex].battlestarttime) / 1000)

    var minutes = Math.floor(battleduration / 60)
    var seconds = Math.floor(battleduration % 60)

    for(j in party){
      if( battleduration <= 0 || targetId.localeCompare(party[j].targetId) != 0) continue
        totalPartyDamage = totalPartyDamage.add(party[j].damage)
    }

    if( totalPartyDamage.equals(0) || battleduration <= 0 || targetId.localeCompare(party[i].targetId) != 0){
      //log('totalPartyDamage 0 or battleduration :' + battleduration)
      return
    }

    //log(bosses[bossIndex].partydamage + ' : ' +totalPartyDamage.toString())

    tdamage = Long.fromString(party[i].damage)
    dps = (tdamage.div(battleduration).toNumber()>>10).toFixed(1)
    dps = numberWithCommas(dps)
    dpsmsg = numberWithCommas(damage.shr(10).toString()) + ' k '.clr('E69F00') + dps + ' k/s '.clr('E69F00')

    return dpsmsg
  }

  function numberWithCommas(x) {
    return x.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }

  function toChat(msg) {
    if(!msg) return
    send(msg)
  }

  function toNotice(msg) {
    if (notice) d.toClient('S_DUNGEON_EVENT_MESSAGE',1, {
      unk1: enraged? 42 : 48,
      unk2: 0,
      unk3: 27,
      message: msg
    })
  }
  function send(msg) { command.message(`[DPS] : ` + [...arguments].join('\n  - '.clr('FFFFFF'))) }
  function status() { send(
    `Enrage message : ${enable ? 'Enabled'.clr('56B4E9') : 'Disabled'.clr('E69F00')}`,
    `Notice to screen : ${notice ? 'Enabled'.clr('56B4E9') : 'Disabled'.clr('E69F00')}`)
  }
  function log(msg) {
    if(debug) console.log(`[DPS] ${msg}`);
  }

  // command
  command.add('dps', (arg, arg2,arg3) => {
    // toggle
    if (!arg) {
      enable = !enable
      send(`${enable ? 'Enabled'.clr('56B4E9') : 'Disabled'.clr('E69F00')}`)
    }
    else if (arg == 'u' || arg=='ui') {
      ui.open()
    }
    else if (arg == 'c' || arg=='current') {
      toChat(membersDps(currentbossId))
    }
    else if (arg == 'nd' || arg=='notice_damage') {
      notice_damage = arg2
      toChat('notice_damage : ' + notice_damage);
    }
    else if (arg == 'h' || arg=='history') {
      toChat(dpsHistory)
      toNotice(dpsHistory)
    }
    else if (arg == 't' || arg=='test') {
      d.toClient('S_DUNGEON_EVENT_MESSAGE', 1 , {
        unk1: arg2, // 42 blue shiny text, 31 normal Text 70 FLASHING_NOTIFICATION
        unk2: 0,
        unk3: 27,
        message: mygId + ' Test message! ' + arg2
      })
      for(i in NPCs){
        log('LIST NPCs'+ NPCs[i].gameId + ' ' + NPCs[i].name)
      }
    }
    // notice
    else if (arg === 'n' ||  arg === 'notice') {
      notice = !notice
      send(`Notice to screen ${notice ? 'enabled'.clr('56B4E9') : 'disabled'.clr('E69F00')}`)
      // status
    } else if (arg === 's' || arg === 'status') status()
    else send(`Invalid argument.`.clr('FF0000') + ' dps or dps h/c/n/s or dps nd 1000000')
  })

  this.destructor = () => {
    command.remove('dps');
  };


}
