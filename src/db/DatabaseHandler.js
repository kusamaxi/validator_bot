const mongoose = require('mongoose');
const { Schema } = mongoose;

module.exports = class DatabaseHandler {
  constructor() {
    this.__initSchema();
  }

  connect(name, pass, ip, port, dbName) {
    const self = this;
    this.KsmBot = mongoose.model('KsmBot', this.ksmbotSchema_);
    this.Validator = mongoose.model('Validator', this.validatorsSchema_);
    mongoose.connect(`mongodb://${name}:${pass}@${ip}:${port}/${dbName}`, {
      useNewUrlParser: true, 
      useUnifiedTopology: true,
      poolSize: 10
    });
    const db = mongoose.connection;
    db.on('error', console.error.bind(console, 'connection error:'));
    db.once('open', async function() {
      console.log('DB connected');
    });
  }

  __initSchema() {
    this.ksmbotSchema_ = new Schema({
      validators:  [{
        address: String,
        nomination: {
          count: Number,
          amount: Number
        },
        identity: {
          display: String,
          displayParent: String
        },
        active: Boolean,
        era: Number,
      }],
      telemetry: [
        {
          channel: String,
          id: Number,
          name: String,
          runtime: String,
          address: String,
          isStale: Boolean,
        }
      ],
      tg_info: {
        from: {
          id: Number,
          is_bot: Boolean,
          first_name: String,
          last_name: String,
          username: String,
          language_code: String,
        },
        chat: {
          id: Number,
          first_name: String,
          last_name: String,
          username: String,
          type: String
        }
      }
    }, { 
      typeKey: '$type',
      collection: 'ksm_bot',
      timestamps: {}
    });

    this.validatorsSchema_ = new Schema({
        stashId: String,
        controllerId: String,
        exposure: {
          total: String,
          own: Number,
          others: [{
            who: String,
            value: Number
          }]
        },
        validatorPrefs: {
          commission: Number,
          blocked: Boolean
        },
        identity: {
          display: String,
          displayParent: String,

        },
        active: Boolean
    }, {
      typeKey: '$type',
      collection: 'bot_validators',
      timestamps: {}
    })
  }

  async updateClient(from, chat, address, identity) {
    const user = await this.KsmBot.findOne({
      'tg_info.from.id': from.id,
      'tg_info.chat.id': chat.id
    }).exec();

    if (user === null) {
      const result = await this.KsmBot.create({
        validators: [{
          address: address,
          nomination: {
            count: 0,
            amount: 0
          },
          identity: identity,
          active: false,
          era: 0,
        }],
        telemetry:[],
        tg_info: {
          from: from,
          chat: chat
        }
      });
    } else {
      // check if address exists
      let result = user.validators.find((validator) => validator.address === address);
      if (result === undefined) {
        // insert address
        result = await this.KsmBot.findOneAndUpdate({
          'tg_info.from.id': from.id,
          'tg_info.chat.id': chat.id
        }, {
          $push: {validators: {
            address: address,
            nomination: {
              count: 0,
              amount: 0
            },
            identity: identity,
            active: false,
            era: 0
          }}
        })
      } else {
        // todo error message
      }
    }
    return true;
  }

  async removeClient(from, chat, address) {
    const result = await this.KsmBot.findOneAndUpdate({
      'tg_info.from.id': from.id,
      'tg_info.chat.id': chat.id
    },{
      $pull: {'validators': {'address': address}}
    }).exec();

    if (result === null) {
      return false;
    }

    return true;
  }

  async getClientValidators(from, chat) {
    const result = await this.KsmBot.findOne({
      'tg_info.from.id': from.id,
      'tg_info.chat.id': chat.id
    }).exec();
    if (result === null) {
      return null;
    }
    return result.validators;
  }

  async getAllClients() {
    const result = await this.KsmBot.find();
    return result;
  }

  async updateNomination(_id, address, count, amount) {
    const result = await this.KsmBot.updateOne({
      '_id': _id,
      'validators.address': address
    }, {
      $set: {'validators.$.nomination': {count: count, amount: amount}}
    });
  }

  async getClientValidator(from, chat, address) {
    const result = await this.KsmBot.findOne({
      'tg_info.from.id': from.id,
      'tg_info.chat.id': chat.id
    }).exec();
    if (result === null) {
      return null;
    }

    for (let v of result.validators) {
      if (v.address === address) {
        return v;
      }
    }
    return null;
  }

  async updateActive(_id, address, era, active) {
    const result = await this.KsmBot.findOneAndUpdate({
      'validators._id': _id,
      'validators.address': address
    }, {
      $set: {
        'validators.$.active': active,
        'validators.$.era': era
      }
    });
  }

  async updateValidators(validators) {
    for (const v of validators) {
      await this.Validator.findOneAndUpdate({
        stashId: v.stashId
      }, {
        $set: {
          controllerId: v.controllerId,
          exposure: v.exposure,
          validatorPrefs: v.validatorPrefs,
          identity: v.identity,
          active: v.active
        }
      }, {
        upsert: true
      });
    }
  }

  async getValidator(stashId) {
    const result = await this.Validator.find({
      'stashId': stashId
    }).exec();

    return result;
  }

  async findIdentity(id) {
    const result = await this.Validator.find({
      'identity.display': id
    }).exec();
    return result;
  }

  async findIdentityParent(parentId, id) {
    const result = await this.Validator.find({
      'identity.display': id,
      'identity.displayParent': parentId
    }).exec();
    return result;
  }

  async updateTelemetry(from, chat, channel, telemetryNode) {
    const user = await this.KsmBot.findOne({
      'tg_info.from.id': from.id,
      'tg_info.chat.id': chat.id
    }).exec();

    if (user === null) {
      const result = await this.KsmBot.create({
        validators: [],
        telemetry: [{
          channel: channel,
          id: telemetryNode.id,
          name: telemetryNode.name,
          runtime: telemetryNode.runtime,
          address: telemetryNode.address, // could be null
          isStale: telemetryNode.isStale,
        }],
        tg_info: {
          from: from,
          chat: chat
        }
      });
    } else {
      // check if address exists
      let result = user.telemetry.find((node) => node.id === telemetryNode.id);
      if (result === undefined) {
        // insert address
        result = await this.KsmBot.findOneAndUpdate({
          'tg_info.from.id': from.id,
          'tg_info.chat.id': chat.id
        }, {
          $push: {telemetry: {
            channel: channel,
            id: telemetryNode.id,
            name: telemetryNode.name,
            runtime: telemetryNode.runtime,
            address: telemetryNode.address, // could be null
            isStale: telemetryNode.isStale,
          }}
        })
      } else {
        // todo error message
      }
    }
    return true;
  }

  async getTelemetryNodes(from, chat) {
    const result = await this.KsmBot.findOne({
      'tg_info.from.id': from.id,
      'tg_info.chat.id': chat.id
    }).exec();
    if (result === null) {
      return null;
    }
    return result.telemetry;
  }

  async removeTelemetry(from, chat, name) {
    const result = await this.KsmBot.findOneAndUpdate({
      'tg_info.from.id': from.id,
      'tg_info.chat.id': chat.id
    },{
      $pull: {'telemetry': {'name': name}}
    }).exec();

    if (result === null) {
      return false;
    }

    return true;
  }

  async getTelemetryNodesWithChatId(channel) {
    const result = await this.KsmBot.find({
      'telemetry.channel': channel
    });
    if (result === null) {
      return null;
    }
    return result.map((item) => {
      return {
        chatId: item.tg_info.chat.id,
        telemetry: item.telemetry
      }
    })
  }
}
