import { segment } from 'oicq'
import fetch from 'node-fetch'
import { common } from './index.js'
import { Data } from '../components/index.js'
import lodash from 'lodash'

const _path = process.cwd()
export default new class setu {
  constructor () {
    this.root = `${_path}/plugins/yenai-plugin/config/setu`
    // 默认配置
    this.def = {
      r18: 0,
      recall: 120,
      cd: 300
    }
    // 存cd的变量
    this.temp = {}
    // 初始化
    this.init()
  }

  async init () {
    Data.createDir('config/setu')
  }

  /**
     * @description: 请求api
     * @param {String} r18 是否r18 0或1
     * @param {Number} num 数量
     * @param {String} tag 关键词
     * @return {Object}
     */
  async setuapi (e, r18, num = 1, tag = '') {
    let api = 'https://api.lolicon.app/setu/v2'

    let apicfg = Data.readJSON('api.json', this.root)
    if (apicfg.api) api = apicfg.api

    let size = 'original'
    let proxy = await redis.get('yenai:proxy')
    if (num > 6) {
      size = 'regular'
    }
    let url = `${api}?r18=${r18}&num=${num}${tag}&proxy=${proxy}&size=${size}`
    let result = await fetch(url).then(res => res.json()).catch(err => console.log(err))
    if (!result) {
      logger.warn(`${e.logFnc}使用备用接口`)
      let apiReserve = `https://sex.nyan.xyz/api/v2/?r18=${r18}&num=${num}${tag}`
      result = await fetch(apiReserve).then(res => res.json()).catch(err => console.log(err))
      if (!result) {
        e.reply('❎ 接口失效')
        return false
      }
    }
    if (lodash.isEmpty(result.data)) {
      e.reply('没有找到相关的tag', false, { at: true })
      return false
    }
    // 消息
    let msg = result.data.map(item => {
      let { pid, title, tags, author, r18, urls, url } = item
      return [
                `${this.sendMsgs}\n`,
                `标题：${title}\n`,
                `画师：${author}\n`,
                `pid：${pid}\n`,
                r18 !== undefined ? `r18：${r18}\n` : '',
                `tag：${lodash.truncate(tags.join(','))}\n`,
                segment.image(url || urls?.original || urls?.regular || urls?.small)
      ]
    })
    return msg
  }

  /**
     * @description: 发送消息和写入cd
     * @param {*} e oicq
     * @param {Array} img 消息数组
     * @return {Boolean}
     */
  async sendMsgOrSetCd (e, msg) {
    // 发送消息
    let res = await common.getRecallsendMsg(e, msg, false)
    if (!res) return false
    // 设置CD
    if (!e.isMaster) this.setCdTime(e.user_id, e.group_id)
  }

  /**
     * @description: 设置cd
     * @param {Number} userId QQ号
     * @param {Number} groupId 群号不传为私聊CD
     * @param {Number} cd cd时间
     * @return {*}
     */
  setCdTime (userId, groupId, cd = this.getCfgCd(userId, groupId)) {
    let present = parseInt(Date.now() / 1000)

    if (!cd) return false
    if (groupId) {
      this.temp[userId + groupId] = present + cd
      setTimeout(() => {
        delete this.temp[userId + groupId]
      }, cd * 1000)
    } else {
      this.temp[userId] = present + cd
      setTimeout(() => {
        delete this.temp[userId]
      }, cd * 1000)
    }
    return true
  }

  // 获取剩余CD时间
  getremainingCd (e) {
    // 获取现在的时间并转换为秒
    let present = parseInt(new Date().getTime() / 1000)
    let over = 0
    if (e.isGroup) {
      if (!this.temp[e.user_id + e.group_id]) return false
      over = (this.temp[e.user_id + e.group_id] - present)
    } else {
      if (!this.temp[e.user_id]) return false
      over = (this.temp[e.user_id] - present)
    }
    if (over <= 0) return false
    return this.Secondformat(over)
  }

  /**
     * @description: 获取配置cd
     * @param {Number} userId QQ号
     * @param {Number} groupId 传群号为群聊配置
     * @return {*}
     */
  getCfgCd (userId, groupId) {
    let data = Data.readJSON(`setu${groupId ? '' : '_s'}.json`, this.root)
    let CD = groupId ? data[groupId]?.cd : data[userId]
    if (CD !== undefined) return CD
    return this.def.cd // 默认300
  }

  /**
     * @description: 获取r18
     * @param {Number} groupID 群号不传为私聊
     * @return {String}  0或1
     */
  getR18 (groupID) {
    let data = Data.readJSON(`setu${groupID ? '' : '_s'}.json`, this.root)
    let R18 = groupID ? data[groupID]?.r18 : data.r18
    if (R18 !== undefined) return R18
    return this.def.r18
  }

  /**
     * @description: 获取群的撤回时间
     * @param {*} e oicq
     * @return {Number}
     */
  getRecallTime (groupId) {
    if (!groupId) return 0
    let data = Data.readJSON('setu.json', this.root)
    let recalltime = data[groupId]?.recall
    if (recalltime !== undefined) return recalltime
    return this.def.recall // 默认120
  }

  /**
     * @description: 设置群cd和撤回时间
     * @param {Number} groupId 群号
     * @param {Number} num 设置时间
     * @param {Boolean} type 为true设置撤回时间反之设置CD
     * @return {Boolean}
     */
  setGroupRecallTimeAndCd (groupId, num, type) {
    let data = Data.readJSON('setu.json', this.root)

    if (!data[groupId]) data[groupId] = lodash.cloneDeep(this.def)

    type ? data[groupId].recall = Number(num) : data[groupId].cd = Number(num)

    return Data.writeJSON('setu.json', data, this.root)
  }

  /**
     * @description: 设置CD
     * @param {*} e oicq
     * @param {String} qq 设置的qq
     * @param {String} cd 设置的cd
     */
  setUserCd (e, qq, cd) {
    let data = Data.readJSON('setu_s.json', this.root)

    data[qq] = Number(cd)
    if (Data.writeJSON('setu_s.json', data, this.root)) {
      e.reply(`✅ 设置用户${qq}的cd成功，cd时间为${cd}秒`)
      delete this.temp[qq]
      return true
    } else {
      e.reply('❎ 设置失败')
      return false
    }
  }

  /**
     * @description: 设置r18
     * @param {String|Number} groupID 群聊id为假时设置私聊
     * @param {Boolean} isopen 开启或关闭
     */
  setR18 (groupID, isopen) {
    let data = Data.readJSON(`setu${groupID ? '' : '_s'}.json`, this.root)
    if (groupID) {
      if (!data[groupID]) data[groupID] = lodash.cloneDeep(this.def)
      data[groupID].r18 = isopen ? 1 : 0
    } else {
      data.r18 = isopen ? 1 : 0
    }
    if (Data.writeJSON(`setu${groupID ? '' : '_s'}.json`, data, this.root)) {
      logger.mark(`[椰奶R18][${groupID ? '群聊' : '私聊'}]已${isopen ? '开启' : '关闭'}${groupID}的涩涩模式`)
      return true
    } else {
      logger.mark(`[椰奶R18][${groupID ? '群聊' : '私聊'}]设置失败`)
      return false
    }
  }

  /**
     * @description: 获取现有设置
     * @param {*} e oicq
     * @return {*}
     */
  getSeSeConfig (e) {
    let set = lodash.cloneDeep(this.def)
    set.cd = this.getCfgCd(e.user_id, e.group_id)
    set.r18 = this.getR18(e.group_id)
    set.recall = this.getRecallTime(e.group_id)
    if (!e.isGroup) delete set.recall
    return set
  }

  /**
    * @description: 格式化秒
    * @param {Number} value 秒
    * @return {String}
    */
  Secondformat (value) {
    let time = common.getsecond(value)

    let { second, minute, hour, day } = time
    // 处理返回消息
    let result = ''
    if (second != 0) {
      result = parseInt(second) + '秒'
    }
    if (minute > 0) {
      result = parseInt(minute) + '分' + result
    }
    if (hour > 0) {
      result = parseInt(hour) + '小时' + result
    }
    if (day > 0) {
      result = parseInt(day) + '天' + result
    }
    return result
  }

  /** 开始执行文案 */
  get startMsg () {
    return lodash.sample([
      '正在给你找setu了，你先等等再冲~',
      '你先别急，正在找了~',
      '马上去给你找涩图，你先憋一会~',
      '奴家马上去给你找瑟瑟的图片~'
    ])
  }

  /** CD中文案 */
  get CDMsg () {
    return lodash.sample([
      '你这么喜欢色图，还不快点冲！',
      '你的色图不出来了！',
      '注意身体，色图看多了对身体不太好',
      '憋住，不准冲！',
      '憋再冲了！',
      '呃...好像冲了好多次...感觉不太好呢...',
      '憋冲了！你已经冲不出来了！',
      '你急啥呢？',
      '你是被下半身控制了大脑吗？'
    ])
  }

  /** 发送图片文案 */
  get sendMsgs () {
    return lodash.sample([
      '给大佬递图',
      '这是你的🐍图',
      '你是大色批',
      '看！要色图的色批出现了！',
      '？',
      '喏，图',
      '给给给个🐍图',
      '色图有我好冲吗？',
      '呐呐呐，欧尼酱别看色图了呐',
      '有什么好色图有给发出来让大伙看看！',
      '没有，有也不给（骗你的～）',
      '天天色图色图的，今天就把你变成色图！',
      '咱没有色图（骗你的～）',
      '哈？你的脑子一天都在想些什么呢，咱才没有这种东西啦。',
      '呀！不要啊！等一...下~',
      '呜...不要啦！太色了咱~',
      '不要这样子啦(*/ω＼*)',
      'Hen....Hentai！。',
      '讨....讨厌了（脸红）',
      '你想...想做什么///',
      '啊.....你...你要干什么？！走开.....走开啦大hentai！一巴掌拍飞！(╯‵□′)╯︵┻━┻',
      '变态baka死宅？',
      '已经可以了，现在很多死宅也都没你这么恶心了',
      '噫…你这个死变态想干嘛！居然想叫咱做这种事，死宅真恶心！快离我远点，我怕你污染到周围空气了（嫌弃脸）',
      '这么喜欢色图呢？不如来点岛风色图？',
      'hso！',
      '这么喜欢看色图哦？变态？',
      'eee，死肥宅不要啦！恶心心！'
    ])
  }
}()
