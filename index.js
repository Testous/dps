/**
* Created by rkkky on 2018-05-21.
*/
"use strict"
const Command = require('command')
const Long = require("long")
const config = require('./config.json')
const regionConfig = require('../../config.json')
const logger = require('./logger')
const xmldom = require('xmldom')
const fs = require('fs')
const path = require('path')
const ui_install = require('./ui_install')
const UI = require('ui')

String.prototype.clr = function (hexColor) { return `<font color='#${hexColor}'>${this}</font>` }

module.exports = function DPS(d,ctx) {

	const command = Command(d)
	const ui = UI(d)

	let enable = config.enable,
	notice = config.notice,
	notice_damage = config.notice_damage,
	debug = config.debug,
	leaving_msg = config.party_leaving_msg,
	region = regionConfig.region

	let mygId,
	myplayerId= '',
	myclass='',
	myname='',
	gzoneId = new Array(),
	gmonsterId = new Array(),
	boss = new Set(),
	NPCs = new Array(),
	party = new Array(),
	dpsHistory = '',
	lastDps= '',
	currentZone='',
	currentbossId = '',
	subHp = new Long(0,0),
	missingDamage = new Long(0,0),
	enraged = false,
	estatus = '',
	timeout = 0,
	timeoutCounter = 0,
	nextEnrage = 0,
	hpPer = 0,
	bossOnly = true,
	doc = null

	// moster xml file
	var monsterfile = path.join(__dirname, '/monsters/monsters-'+ region + '.xml')
	fs.readFile(monsterfile, "utf-8", function (err,data)
	{
		if (err) {
			return log(err)
		}
		const parser = new xmldom.DOMParser({ errorHandler })
		doc = parser.parseFromString(data, 'text/xml')
		if (!doc) {
			log('ERROR xml doc')
			return
		}
		//log(findZoneMonster(152,2003)) //학살의 사브라니악
	})

	function getNPCInfoFromXml(gId)
	{
		var zone,mon
		var npcIndex = getNPCIndex(gId)
		if (npcIndex < 0) return false
		try{
			var zone = doc.getElementsByTagName("Zone")
			for(var i in zone)
			{
				if(zone[i].getAttribute("id") == Number(NPCs[npcIndex].huntingZoneId)) {
					NPCs[npcIndex].zoneName = zone[i].getAttribute("name")
					break
				}
			}

			var mon = zone[i].getElementsByTagName("Monster")
			for(var j in mon)
			{
				if(mon[j].getAttribute("id") == Number(NPCs[npcIndex].templateId)) {
					NPCs[npcIndex].npcName = mon[j].getAttribute("name")
					mon[j].getAttribute("isBoss").localeCompare("True") ? NPCs[npcIndex].isBoss = false : NPCs[npcIndex].isBoss = true
					break
				}
			}
		}
		catch(err){
			return false
		}
		return true
	}

	// awesomnium web browser UI
	ui.use(UI.static(__dirname + '/html'))
	ui.get(`/api/*`, api.bind(ctx))

	function getData(param) {
		var paramRegex = /(\d*)(\D*)/
		var data = param.match(paramRegex)
		data.shift()
		return data
	}

	function api(req, res) {
		const api = getData(req.params[0])
		var req_value = Number(api[0])
		switch(api[1]) {
			case "L":
			leaveParty()
			return res.status(200).json('ok')
			case "S":
			resetPartyDps(currentbossId)
			return res.status(200).json('ok')
			case "R":
			return res.status(200).json(estatus+ '</br>' + membersDps(currentbossId) )
			case "H":
			toChat(dpsHistory)
			return res.status(200).json(dpsHistory)
			case "P":
			enable = false
			send(`${enable ? 'Enabled'.clr('56B4E9') : 'Disabled'.clr('E69F00')}`)
			return res.status(200).json("ok")
			case "N":
			req_value == 1 ? notice = true : notice = false
			send(`Notice to screen ${notice ? 'enabled'.clr('56B4E9') : 'disabled'.clr('E69F00')}`)
			return res.status(200).json("ok")
			case "O":
			req_value == 1 ? bossOnly = true : bossOnly = false
			send(`Boss dps only ${bossOnly ? 'enabled'.clr('56B4E9') : 'disabled'.clr('E69F00')}`)
			return res.status(200).json("ok")
			case "D":
			notice_damage = req_value
			send('Notice damage is ' + numberWithCommas(notice_damage.toString()))
			return res.status(200).json(notice_damage.toString())
			case "A":
			notice_damage += 1000000
			if(notice_damage > 20000000) notice_damage = 1000000
			send('Notice damage is ' + numberWithCommas(notice_damage.toString()))
			return res.status(200).json(notice_damage.toString())
			case "B":
			debug = !debug
			send(`Debug ${debug ? 'enabled'.clr('56B4E9') : 'disabled'.clr('E69F00')}`)
			return res.status(200).json("ok")
			case "C":
			d.toServer('C_CHAT', 1, {
				"channel": req_value,
				"message": stripOuterHTML(lastDps)
			})
			return res.status(200).json("ok")
			default:
			return res.status(404).send("404")
		}
	}

	// packet handle
	d.hook('S_LOGIN',10, (e) => {
		mygId=e.gameId.toString()
		myplayerId=e.playerId.toString()
		myname=e.name.toString()
		//# For players the convention is 1XXYY (X = 1 + race*2 + gender, Y = 1 + class). See C_CREATE_USER
		myclass = Number((e.templateId - 1).toString().slice(-2)).toString()
		party = []
		putMeInParty()
	})

	d.hook('S_SPAWN_ME',2, (e) => {
		mygId=e.gameId.toString()
		currentbossId = ''
		NPCs = []
		if (!enable) return
		ui.open()
	})

	d.hook('S_LOAD_TOPO',3, (e) => {
		currentZone = e.zone
	})

	d.hook('S_BOSS_GAGE_INFO',3, (e) => {
		// notified boss before battle
		var hpMax = e.maxHp
		var hpCur = e.curHp
		subHp = e.maxHp.sub(e.curHp) // Long
		hpPer = hpCur.multiply(100).div(hpMax)
		nextEnrage = (hpPer > 10) ? (hpPer - 10) : 0
	})

	d.hook('S_SPAWN_NPC',8, (e) => {
		var newNPC = {
			'gameId' : e.gameId.toString(),
			'owner' : e.owner.toString(),
			'huntingZoneId' : e.huntingZoneId,
			'templateId' : e.templateId,
			'zoneName' : 'unknown',
			'npcName' : e.npcName,
			'isBoss' : false,
			'battlestarttime' : 0,
			'battleendtime' : 0,
			'dpsmsg' : ''
		}
		if(getNPCIndex(e.gameId.toString()) < 0)
		{
			NPCs.push(newNPC)
			getNPCInfoFromXml(e.gameId.toString())
		}
	})

	d.hook('S_DESPAWN_NPC',3, (e) => {
		var id = e.gameId.toString()
		var npcIndex = getNPCIndex(id)
		if( npcIndex >= 0 && NPCs[npcIndex].battleendtime == 0 && NPCs[npcIndex].isBoss ){
			NPCs[npcIndex].battleendtime = Date.now()
			enraged = false
			clearTimeout(timeout)
			clearTimeout(timeoutCounter)
			timeout = 0
			timeoutCounter = 0
			estatus = ''
			// checking if this packet comes later then attack on new boss monster
			if(id.localeCompare(currentbossId) == 0) dpsHistory += membersDps(id)
			else dpsHistory += NPCs[npcIndex].dpsmsg
		}
		NPCs.splice(npcIndex,1)
	})

	d.hook('S_NPC_STATUS',1, (e) => {
		if(!isBoss(e.creature.toString())) return
		if (e.enraged === 1 && !enraged) {
			enraged = true
			timeout = setTimeout(timeRemaining, 26000)
			estatus = 'Boss Enraged'.clr('FF0000')
		} else if (e.enraged === 0 && enraged) {
			if (hpPer === 100) return
			clearTimeout(timeout)
			clearTimeout(timeoutCounter)
			timeout = 0
			timeoutCounter = 0
			enraged = false
			estatus = 'Next enraged at ' + nextEnrage.toString().clr('FF0000') + '%'
		}
	})

	//party handler
	d.hook('S_LEAVE_PARTY_MEMBER',2,(e) => {
		var id = e.playerId.toString()
		for(var i in party){
			if(id.localeCompare(party[i].playerId) == 0) party.splice(i,1)
		}
	})

	d.hook('S_LEAVE_PARTY',1, (event) => {
		party = []
		putMeInParty()
	})


	d.hook('S_PARTY_MEMBER_LIST',6,(event) => {
		party = []
		event.members.forEach(member => {
			var newmember = {
				'gameId' : member.gameId.toString(),
				'playerId' : member.playerId.toString(),
				'name' : member.name.toString(),
				'class' : member.class.toString()
			}
			if(!isPartyMember(member.gameId.toString())) {
				party.push(newmember)
			}
		})
	})

	function resetPartyDps(gid)
	{
		lastDps =''
		for(var i in party ){
			//log('party ' + key)
			if(typeof party[i][gid] == 'undefined') continue
			delete party[i][gid]
		}

		for(var key in NPCs){
			if(gid.localeCompare(NPCs[key].gameId) == 0){
				//log('NPCs ' + key + 'NPCs[key].battlestarttime ' + NPCs[key].battlestarttime + 'NPCs[key].battleendtime '+NPCs[key].battleendtime)
				NPCs[key].battlestarttime=0
				NPCs[key].battleendtime=0
			}
		}
	}

	function leaveParty()
	{
		if(leaving_msg!=''){
			d.toServer('C_CHAT', 1, {
				"channel": 1,
				"message": leaving_msg
			})
		}
		setTimeout(function(){ d.toServer('C_LEAVE_PARTY', 1, { }) }, 1000);
	}

	function putMeInParty()
	{
		var newmember = {
			'gameId' : mygId,
			'playerId' : myplayerId,
			'name' : myname,
			'class' : myclass
		}

		if(!isPartyMember(mygId)) {
			party.push(newmember)
		}
	}

	function getIndexOfPetOwner(sid,oid)
	{
		for(var i in party){
			for(var j in NPCs){
				if(NPCs[j].owner.localeCompare(party[i].gameId) == 0){
					// pet attack
					if(NPCs[j].gameId.localeCompare(sid) == 0) {
						return i
					}
					// pet projectile
					if(NPCs[j].gameId.localeCompare(oid) == 0) {
						return i
					}
				}
			}
		}
		return -1
	}

	function isBoss(gId)
	{
		for(var i in NPCs){
			if(gId.localeCompare(NPCs[i].gameId) == 0) return NPCs[i].isBoss
		}
		return false
	}


	function getNPCIndex(gId){
		for(var i in NPCs){
			if(gId.localeCompare(NPCs[i].gameId) == 0) return i
		}
		return -1
	}

	function isPartyMember(gid){
		for(var i in party){
			if(gid.localeCompare(party[i].gameId) == 0) return true
		}
		return false
	}

	function getPartyMemberIndex(id){
		for(var i in party){
			if(id.localeCompare(party[i].gameId) == 0) return i
		}
		return -1
	}

	// damage handler : Core
	d.hook('S_EACH_SKILL_RESULT',d.base.majorPatchVersion < 74 ? 7:8, (e) => {
		var memberIndex = getPartyMemberIndex(e.source.toString())
		var sourceId = e.source.toString()
		var target = e.target.toString()

		if(e.damage.gt(0) && !e.blocked){
			if(memberIndex >= 0){
				// members damage
				if(!addMemberDamage(sourceId,target,e.damage.toString(),e.crit)){
					//log('[DPS] : unhandled members damage ' + e.damage + ' target : ' + target)
				}
				// notice damage
				if(mygId.localeCompare(sourceId) == 0){
					currentbossId = target
					if(e.damage.gt(notice_damage)) {
						toNotice(noticeDps(memberIndex,e.damage,target))
					}
				}
			}
			else if(memberIndex < 0){
				// projectile
				var ownerIndex = getPartyMemberIndex(e.owner.toString())
				if(ownerIndex >= 0) {
					var sourceId = e.owner.toString()
					if(!addMemberDamage(sourceId,target,e.damage.toString(),e.crit)){
						//log('[DPS] : unhandled projectile damage ' + e.damage + ' target : ' + target)
						//log('[DPS] : srcId : ' + sourceId + ' mygId : ' + mygId)
						//log(e)
					}

					// notice damage
					if(mygId.localeCompare(sourceId) == 0){
						currentbossId = target
						if(e.damage.gt(notice_damage)) {
							toNotice(noticeDps(ownerIndex,e.damage,target))
						}
					}

				}
				else{// pet
					var petIndex=getIndexOfPetOwner(e.source.toString(),e.owner.toString())
					if(petIndex >= 0) {
						var sourceId = party[petIndex].gameId
						if(!addMemberDamage(sourceId,target,e.damage.toString(),e.crit)){
							//log('[DPS] : unhandled pet damage ' + e.damage + ' target : ' + target)
							//log('[DPS] : srcId : ' + sourceId + ' mygId : ' + mygId)
							//log(e)
						}

						// notice damage
						if(mygId.localeCompare(sourceId) == 0){
							//currentbossId = target
							if(e.damage.gt(notice_damage)) {
								toNotice(noticeDps(petIndex,e.damage,target))
							}
						}

					}
					else{
						//var npcIndex= getNPCIndex(target)
						//if(npcIndex < 0) log('[DPS] : Target is not NPC ' + e.damage + ' target : ' + target)
						//else log('[DPS] : unhandled NPC damage ' + e.damage + ' target : ' + NPCs[npcIndex].npcName)
					}
				}
			}
		}
	})

	function addMemberDamage(id,target,damage,crit)
	{
		//log('addMemberDamage ' + id + ' ' + target + ' ' + damage + ' ' + crit)
		var npcIndex = getNPCIndex(target)
		if(npcIndex <0) return false
		//log(npcIndex + ':' + NPCs[npcIndex].battlestarttime)
		if(NPCs[npcIndex].battlestarttime == 0){
			NPCs[npcIndex].battlestarttime = Date.now()
		}

		for(var i in party){
			if(id.localeCompare(party[i].gameId) == 0) {
				//new monster
				if(typeof party[i][target] == 'undefined')
				{
					var critDamage
					if(crit) critDamage = damage
					else critDamage = "0"
					party[i][target] = {
						'battlestarttime' : Date.now(),
						'damage' : damage,
						'critDamage' : critDamage,
						'hit' : 1,
						'crit' : crit
					}
					//log('addMemberDamage true new monster')
					return true
				}
				else {
					party[i][target].damage = Long.fromString(damage).add(party[i][target].damage).toString()
					if(crit) party[i][target].critDamage = Long.fromString(party[i][target].critDamage).add(damage).toString()
					party[i][target].hit += 1
					if(crit) party[i][target].crit +=1
					//log('addMemberDamage true ' + party[i][target].damage)
					return true
				}
			}
		}
		//log('addMemberDamage false')
		return false
	}

	function membersDps(targetId)
	{
		var newLine = '    \n'
		var endtime = 0
		var dpsmsg = newLine
		var bossIndex = -1
		var tdamage = new Long(0,0)
		var totalPartyDamage = new Long(0,0)

		if(targetId==='') return lastDps

		var npcIndex = getNPCIndex(targetId)

		//if(npcIndex < 0) log(npcIndex)
		if(npcIndex < 0) return lastDps

		if( NPCs[npcIndex].battleendtime == 0) endtime=Date.now()
		else endtime=NPCs[npcIndex].battleendtime
		var battleduration = Math.floor((endtime-NPCs[npcIndex].battlestarttime) / 1000)

		var minutes = Math.floor(battleduration / 60)
		var seconds = Math.floor(battleduration % 60)

		dpsmsg = NPCs[npcIndex].npcName + ':' + NPCs[npcIndex].zoneName  + ' ' + minutes + ':' + seconds + newLine + '</br>'
		dpsmsg = dpsmsg.clr('E69F00')
		if(enraged) dpsmsg = '<img class=enraged />'+dpsmsg

		party.sort(function(a,b) {
			if(typeof a[targetId] == 'undefined' || typeof b[targetId] == 'undefined') return 0
			if(Number(a[targetId].damage) < Number(b[targetId].damage)) return 1
			else if(Number(b[targetId].damage) < Number(a[targetId].damage)) return -1
			else return 0
		})

		var cname
		var dps=0

		for(var i in party){
			if( battleduration <= 0 || typeof party[i][targetId] == 'undefined' ) {
				//log(battleduration + ':' + party[i][targetId])
				continue
			}
			totalPartyDamage = totalPartyDamage.add(party[i][targetId].damage)
		}

		//if(!totalPartyDamage.sub(subHp).equals(0))
		//log('sub Hp : total damage' + subHp + '-' + totalPartyDamage + '=' + subHp.sub(totalPartyDamage))

		var fill_size = 0

		dpsmsg += '<table><tr><td>Name</td><td>DPS (dmg)</td><th>DPS (%)</td><td>Crit</td></tr>' + newLine
		for(var i in party){
			//log('totalPartyDamage ' + totalPartyDamage.shr(10).toString() + ' battleduration ' + battleduration + ' damage ')
			if( totalPartyDamage.shr(10).equals(0) || battleduration <= 0 || typeof party[i][targetId] == 'undefined') continue

			cname=party[i].name
			if(party[i].gameId.localeCompare(mygId) == 0) cname=cname.clr('00FF00')
			var cimg = '<img class=class' +party[i].class + ' />'
			cname = cname + cimg
			//log(cname)

			tdamage = Long.fromString(party[i][targetId].damage)
			dps = numberWithCommas((tdamage.div(battleduration).toNumber()/1000).toFixed(1))

			var percentage = tdamage.shr(10).multiply(1000).div(totalPartyDamage.shr(10)).toNumber()/10

			// the smallest gap size from highest damage (sorted)
			if(i==0) fill_size = 100 - percentage

			// add the gap size for each member graph
			var graph_size = percentage + fill_size

			var crit
			if(party[i][targetId].crit == 0 || party[i][targetId].hit == 0) crit = 0
			else crit = Math.floor(party[i][targetId].crit * 100 / party[i][targetId].hit)

			dpsmsg +='<tr><td>' + cname + '</td>' + `<td style="background: url('./icons/bar.jpg'); background-repeat: no-repeat; background-size: ${graph_size}% 20%;">` + dps + 'k/s '.clr('E69F00') + '</td>'
			+ '<td>' + percentage  + '% '.clr('E69F00') + '</td>'
			+ '<td class=graph>' +  crit  + '% '.clr('E69F00') + '</td></tr>'+ newLine
			//log(dpsmsg)
		}
		dpsmsg += '</table>'

		// for history
		NPCs[npcIndex].dpsmsg = dpsmsg
		// To display last msg on ui even if boss removed from list by DESPAWN packet
		lastDps = dpsmsg

		return dpsmsg
	}

	function noticeDps(i,damage,targetId)
	{

		var endtime = 0
		var dpsmsg = ''
		var bossIndex = -1
		var tdamage = new Long(0,0)
		var totalPartyDamage  = new Long(0,0)
		var dps=0

		var npcIndex = getNPCIndex(targetId)

		if(npcIndex < 0) return

		if( NPCs[npcIndex].battleendtime == 0) endtime=Date.now()
		else endtime=NPCs[npcIndex].battleendtime
		var battleduration = Math.floor((endtime-NPCs[npcIndex].battlestarttime) / 1000)

		var minutes = Math.floor(battleduration / 60)
		var seconds = Math.floor(battleduration % 60)

		for(var j in party){
			if( battleduration <= 0 || typeof party[j][targetId] == 'undefined') continue
			totalPartyDamage = totalPartyDamage.add(party[j][targetId].damage)
		}

		if( totalPartyDamage.equals(0) || battleduration <= 0 || typeof party[i][targetId] == 'undefined'){
			return
		}

		tdamage = Long.fromString(party[i][targetId].damage)
		dps = (tdamage.div(battleduration).toNumber()>>10).toFixed(1)
		dps = numberWithCommas(dps)
		dpsmsg = numberWithCommas(damage.shr(10).toString()) + ' k '.clr('E69F00') + dps + ' k/s '.clr('E69F00')

		return dpsmsg
	}

	function timeRemaining() {
		let i = 10
		timeoutCounter = setInterval( () => {
			if (enraged && i > 0) {
				estatus = 'Boss Enraged'.clr('FF0000') + ' ' + `${i}`.clr('FF0000') + ' seconds left'.clr('FFFFFF')
				i--
			} else {
				clearInterval(timeoutCounter)
				timeoutCounter = -1
				estatus = ''
			}
		}, 1000)
	}

	// helper
	function stripOuterHTML(str) {
		return str.replace(/^<[^>]+>|<\/[^>]+><[^\/][^>]*>|<\/[^>]+>$/g, '')
	}

	function numberWithCommas(x) {
		return x.replace(/\B(?=(\d{3})+(?!\d))/g, ",")
	}

	function toChat(msg) {
		if(!msg) return
		send(msg)
	}

	function toNotice(msg) {
		if (notice) d.toClient('S_DUNGEON_EVENT_MESSAGE',1, {
			unk1: 42,
			unk2: 0,
			unk3: 27,
			message: msg
		})
	}

	function send(msg) { command.message(`[DPS] : ` + [...arguments].join('\n  - '.clr('FFFFFF'))) }

	function log(msg) {
		if(debug) console.log(msg)
	}

	const errorHandler = {
		warning(msg) {
			logger.warn({ err: msg }, 'xml parser warning')
		},

		error(msg) {
			logger.error({ err: msg }, 'xml parser error')
		},

		fatalError(msg) {
			logger.error({ err: msg }, 'xml parser fatal error')
		},
	}

	// command
	command.add('dps', (arg, arg2,arg3) => {
		// toggle
		if (!arg) {
			enable = !enable
			send(`${enable ? 'Enabled'.clr('56B4E9') : 'Disabled'.clr('E69F00')}`)
		}
		else if (arg == 'u' || arg=='ui') {
			enable = true
			send(`${enable ? 'Enabled'.clr('56B4E9') : 'Disabled'.clr('E69F00')}`)
			ui.open()
		}
		else if (arg == 'nd' || arg=='notice_damage') {
			notice_damage = arg2
			toChat('notice_damage : ' + notice_damage)
		}
		else if (arg == 'h' || arg=='history') {
			toChat(dpsHistory)
		}
		else if (arg == 't' || arg=='test') {

		}
		// notice
		else if (arg === 'n' ||  arg === 'notice') {
			notice = !notice
			send(`Notice to screen ${notice ? 'enabled'.clr('56B4E9') : 'disabled'.clr('E69F00')}`)
		}
		else send(`Invalid argument.`.clr('FF0000') + ' dps or dps u/h/n/s or dps nd 1000000')
	})

	this.destructor = () => {
		command.remove('dps')
	}
}
