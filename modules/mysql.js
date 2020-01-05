const mysql = require('mysql');
const Logs = require('./logs');

const configSql = {
    tables: {
        chat_commands: {
            table: "bot_twitch_commands",
            columns: ["id", "command", "message"]
        },
        users_xp: {
            table: "bot_twitch_users_xp",
            columns: ["user_id", "username", "xp", "xp_next_level", "level", "last_message_time"]
        }
    }
};

class Mysql {
    constructor(mysqlInfos) {
        let host = mysqlInfos.host;
        let databaseName = mysqlInfos.database;
        console.log("[MYSQL] - Connection à la base : " + host);
        let database = mysql.createConnection({
            host: host,
            user: mysqlInfos.user,
            password: mysqlInfos.password,
            database: databaseName
        });
        database.connect(function (err) {
            if (err) {
                Logs.logError(err);
                throw err;
            }
            console.log("[MYSQL] - Base SQL : " + host + "/" + databaseName + " connectée.");
            createCommandsTable(database);
            createUserXpTable(database);
        });
        this.database = database;
    }

    messageUserXP(user, client, channel, Twitch, config) {
        const database = this.database;
        Twitch.callApi(config.api.twitch, client, function (data) {
            if (data.isStreaming) {
                const userId = user['user-id'];
                const userName = user['username'];
                const now = Date.now();
                const requestCommand = "SELECT * FROM " + configSql.tables.users_xp.table + " WHERE " + configSql.tables.users_xp.columns[0] + "='" + userId + "'";
                if (parseInt(userId) === config.settings.streamerId) {
                    return;
                }
                database.query(requestCommand, function (err, result) {
                    if (err) {
                        Logs.logError(err);
                        throw err;
                    }
                    if (result.length < 1) {
                        const requestInsert = "INSERT INTO " + configSql.tables.users_xp.table + " VALUES (" + userId + ", '" + userName + "', 0, 50, 0, " + now + ")";
                        database.query(requestInsert, function (err) {
                            if (err) {
                                Logs.logError(err);
                                throw err;
                            }
                        });
                    } else {
                        let xp = result[0].xp;
                        let xp_next = result[0].xp_next_level;
                        let level = result[0].level;
                        let lastMessageTimestamp = result[0].last_message_time;
                        const now = Date.now();
                        if ((now - lastMessageTimestamp) / 1000 >= 210) {
                            xp += 10 + parseInt(level / 2);
                            if (xp >= xp_next) {
                                level++;
                                xp_next += 30 + level;
                                xp = 0;
                                Logs.logSystem("[LEVEL] " + user['display-name'] + " est passé au niveau " + level);
                                console.log("[LEVEL] " + user['display-name'] + " est passé au niveau " + level);
                                if (level % 5 === 0) {
                                    client.say(channel, "imGlitch " + user['display-name'] + " est passé au niveau " + level + ' ! imGlitch');
                                }
                            }
                            const requestXpUpdate = "UPDATE " + configSql.tables.users_xp.table + " SET " +
                                configSql.tables.users_xp.columns[1] + "= '" + userName + "', " +
                                configSql.tables.users_xp.columns[2] + "=" + xp + ", " +
                                configSql.tables.users_xp.columns[3] + "=" + xp_next + ", " +
                                configSql.tables.users_xp.columns[4] + "=" + level + ", " +
                                configSql.tables.users_xp.columns[5] + "=" + now +
                                " WHERE " + configSql.tables.users_xp.columns[0] + "=" + userId;
                            database.query(requestXpUpdate, function (err) {
                                if (err) {
                                    Logs.logError(err);
                                    throw err;
                                }
                            });
                        }
                    }
                });
            }
        });
    }

    timeUsersXP(users, client, channel, Twitch, config) {
        const database = this.database;
        Twitch.callApi(config.api.twitch, client, function (data) {
            if (data.isStreaming) {
                let usersList = fetchUsersInRow(users);
                const requestCommand = "SELECT * FROM " + configSql.tables.users_xp.table + " WHERE " + configSql.tables.users_xp.columns[1] + " IN (" + usersList + ")";
                database.query(requestCommand, function (err, result) {
                    if (err) {
                        Logs.logError(err);
                        throw err;
                    }
                    let updateXP = [];
                    for (let i = 0; i < result.length; ++i) {
                        if (result[i].user_id !== config.settings.streamerId) {
                            let userXp = {
                                userId: result[i].user_id,
                                xp: result[i].xp,
                                xpNext: result[i].xp_next_level,
                                level: result[i].level
                            };
                            userXp.xp += 5 + parseInt(userXp.level / 2);
                            if (userXp.xp >= userXp.xpNext) {
                                userXp.level++;
                                userXp.xpNext += 30 + userXp.level;
                                userXp.xp = 0;
                                Logs.logSystem("[LEVEL] " + result[i].username + " est passé au niveau " + userXp.level);
                                console.log("[LEVEL] " + result[i].username + " est passé au niveau " + userXp.level);
                                if (userXp.level % 5 === 0) {
                                    client.say(channel, "imGlitch " + result[i].username + " est passé au niveau " + userXp.level + ' ! imGlitch');
                                }
                            }
                            updateXP.push(userXp);
                        }
                    }
                    let updateValues = "";
                    for (let i = 0; i < updateXP.length; ++i) {
                        updateValues += "(" + updateXP[i].userId + ", " + updateXP[i].xp + ", " + updateXP[i].xpNext + ", " + updateXP[i].level + ")";
                        if (i + 1 < updateXP.length) {
                            updateValues += ',';
                        }
                    }
                    const requestSql = "INSERT INTO " + configSql.tables.users_xp.table + " (" +
                        configSql.tables.users_xp.columns[0] + ", " + configSql.tables.users_xp.columns[2] + ", " +
                        configSql.tables.users_xp.columns[3] + ", " + configSql.tables.users_xp.columns[4] +
                        ") VALUES " + updateValues + " ON DUPLICATE KEY UPDATE " +
                        configSql.tables.users_xp.columns[2] + " = VALUES(" + configSql.tables.users_xp.columns[2] + ")," +
                        configSql.tables.users_xp.columns[3] + " = VALUES(" + configSql.tables.users_xp.columns[3] + ")," +
                        configSql.tables.users_xp.columns[4] + " = VALUES(" + configSql.tables.users_xp.columns[4] + ")";
                    database.query(requestSql, function (err) {
                        if (err) {
                            Logs.logError(err);
                            throw err;
                        }
                    })
                });
            }
        });
    }

    getUserExp(userId, cb) {
        const database = this.database;
        const request = "SELECT * FROM " + configSql.tables.users_xp.table + " WHERE " + configSql.tables.users_xp.columns[0] + "=" + userId;
        database.query(request, function (err, result) {
            if (err) {
                Logs.logError(err);
                throw err;
            }
            if (result.length !== 0) {
                getUserRank(database, userId, function (userRank) {
                    const data = {
                        result: result[0],
                        userRank: userRank
                    };
                    cb(data);
                });
            } else {
                cb(null);
            }
        })
    }

    getUserClassment(cb) {
        const request = "SELECT " + configSql.tables.users_xp.columns[1] + "," + configSql.tables.users_xp.columns[2] + "," + configSql.tables.users_xp.columns[4] +
            " FROM " + configSql.tables.users_xp.table + " ORDER BY " + configSql.tables.users_xp.columns[4] + " DESC, " + configSql.tables.users_xp.columns[2] + " DESC LIMIT 100";
        this.database.query(request, function (err, result) {
            if (err) {
                Logs.logError(err);
                throw err;
            }
            cb(result);
        })
    }

    getCommandList(cb) {
        const requestCommand = "SELECT " + configSql.tables.chat_commands.columns[1] + " FROM " + configSql.tables.chat_commands.table;
        this.database.query(requestCommand, function (err, result) {
            if (err) {
                Logs.logError(err);
                throw err;
            }
            let commandList = [];
            for (let i = 0; i < result.length; ++i) {
                commandList.push(result[i].command);
            }
            cb(commandList);
        });
    }

    getChatCommand(cmd, cb) {
        const requestCommand = "SELECT * FROM " + configSql.tables.chat_commands.table + " WHERE " + configSql.tables.chat_commands.columns[1] + "='" + cmd + "'";
        this.database.query(requestCommand, function (err, result) {
            if (err) {
                Logs.logError(err);
                throw err;
            }
            if (result.length > 0) {
                cb(result[0].message);
            } else {
                cb(null);
            }
        });
    }
}

function getUserRank(database, userId, cb) {
    const request = "SELECT * FROM " + configSql.tables.users_xp.table + " ORDER BY " + configSql.tables.users_xp.columns[4] + " DESC, " + configSql.tables.users_xp.columns[2] + " DESC";
    database.query(request, function (err, result) {
        if (err) {
            Logs.logError(err);
            throw err;
        }
        for (let i = 0; i < result.length; ++i) {
            if (result[i].user_id === parseInt(userId)) {
                cb(i + 1);
                return;
            }
        }
        cb(-1);
    });
}

function createUserXpTable(database) {
    const createUserXpTable = "CREATE TABLE IF NOT EXISTS " + configSql.tables.users_xp.table +
        " (" + configSql.tables.users_xp.columns[0] + " INT PRIMARY KEY, " +
        configSql.tables.users_xp.columns[1] + " VARCHAR(255), " +
        configSql.tables.users_xp.columns[2] + " INT, " +
        configSql.tables.users_xp.columns[3] + " INT, " +
        configSql.tables.users_xp.columns[4] + " INT, " +
        configSql.tables.users_xp.columns[5] + " BIGINT)";
    database.query(createUserXpTable, function (err, result) {
        if (err) {
            Logs.logError(err);
            throw err;
        }
        if (result.warningCount === 0) {
            Logs.logSystem("[MYSQL] - Table : " + configSql.tables.users_xp.table + " crée");
            console.log("[MYSQL] - Table : " + configSql.tables.users_xp.table + " crée");
        }
    });
}

function createCommandsTable(database) {
    const createCmdTable = "CREATE TABLE IF NOT EXISTS " + configSql.tables.chat_commands.table +
        " (" + configSql.tables.chat_commands.columns[0] + " INT AUTO_INCREMENT PRIMARY KEY, " +
        configSql.tables.chat_commands.columns[1] + " VARCHAR(255), " +
        configSql.tables.chat_commands.columns[2] + " VARCHAR(255))";
    database.query(createCmdTable, function (err, result) {
        if (err) {
            Logs.logError(err);
            throw err;
        }
        if (result.warningCount === 0) {
            const insertCommands = "INSERT INTO " + configSql.tables.chat_commands.table + " (" +
                configSql.tables.chat_commands.columns[1] + ", " +
                configSql.tables.chat_commands.columns[2] + ") VALUES " +
                "('prog', 'La programmation des lives : https://funixgaming.fr/prog')," +
                "('extension', \"Tu veux être au courant des prochains lives ? Tu peux télécharger l'extension chrome ! https://goo.gl/KiaU8K\")," +
                "('instantgaming', 'Payez vos jeux moins chers ! https://goo.gl/x12DKs Partenaire Instant Gaming <3')," +
                "('twitter', 'Mon twitter : https://twitter.com/funixgaming')," +
                "('instagram', 'Mon instagram : https://instagram.com/funixgaming_')," +
                "('youtube', 'Ma chaine YouTube : https://youtube.com/c/funixgaming')," +
                "('utip', 'Mon utip : https://utip.io/funixgaming (me soutenir via les pubs)')," +
                "('don', \"La donnation est un moyen d'aider et de me soutenir : https://streamlabs.com/funixgaming\")," +
                "('sub', \"LE SUB C'EST VRAIMENT SUPER ! : https://www.twitch.tv/products/funixgaming <3\")," +
                "('battlenet', \"Pour m'ajouter en ami sur BattleNet : FunixGaming#2154\")";
            database.query(insertCommands, function (err) {
                if (err) {
                    Logs.logError(err);
                    throw err;
                }
            });
            Logs.logSystem("[MYSQL] - Table : " + configSql.tables.chat_commands.table + " crée");
            console.log("[MYSQL] - Table : " + configSql.tables.chat_commands.table + " crée");
        }
    });
}

function fetchUsersInRow(users) {
    let usersRow = '';
    let nbrVips = users.vips.length;
    let nbrMods = users.moderators.length;
    let nbrViewers = users.viewers.length;
    for (let i = 0; i < nbrVips; ++i) {
        usersRow += "'" + users.vips[i] + (i + 1 === nbrVips ? "'" : "', ");
    }
    if (nbrMods > 0) {
        if (nbrVips > 0) {
            usersRow += ", ";
        }
        for (let i = 0; i < nbrMods; ++i) {
            usersRow += "'" + users.moderators[i] + (i + 1 === nbrMods ? "'" : "', ");
        }
    }
    if (nbrViewers > 0) {
        if (nbrVips > 0 || nbrMods > 0) {
            usersRow += ", ";
        }
        for (let i = 0; i < nbrViewers; ++i) {
            usersRow += "'" + users.viewers[i] + ((i + 1 === nbrViewers) ? "'" : "', ");
        }
    }
    return usersRow;
}

module.exports = Mysql;
