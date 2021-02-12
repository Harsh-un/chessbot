const chess = require('chess')

const { board } = require('@/keyboards')
const { debug, isWhiteTurn, topMessage, statusMessage } = require('@/helpers')

module.exports = () => async (ctx) => {
  let user = await ctx.db('users')
    .where('id', Number(ctx.from.id))
    .first()

  if (user) {
    if (JSON.stringify(user) !== JSON.stringify(ctx.from)) {
      await ctx.db('users')
        .where('id', Number(user.id))
        .update(ctx.from)
        .catch(debug)
    }
  } else {
    await ctx.db('users').insert(ctx.from).catch(debug)
    user = await ctx.db('users').where('id', ctx.from.id).first().catch(debug)
  }

  const games = await ctx.db('games')
    .where({ whites_id: ctx.from.id })
    .orWhere({ blacks_id: ctx.from.id })
    .orderBy('created_at', 'desc')
    .offset(Number(ctx.update.inline_query.offset))
    .limit(!ctx.update.inline_query.offset ? 48 : 50)
    .catch(debug)

  const list = await Promise.all(games.map(async (game, idx) => {
    const gameClient = chess.create({ PGN: true })
    let status

    const enemy = await ctx.db('users')
      .where('id', game.whites_id === ctx.from.id ? game.blacks_id : game.whites_id)
      .first()
      .catch(debug)

    const moves = await ctx.db('moves')
      .where('game_id', game.id)
      .orderBy('created_at', 'asc')
      .catch(debug)

    moves.forEach(({ entry }) => {
      try {
        gameClient.move(entry)
      } catch (error) {
        debug(error)
      }
    })

    status = gameClient.getStatus()
    const fen = gameClient.getFen()
    const createdAt = new Date(Date.parse(game.created_at))
    return {
      id: !ctx.update.inline_query.offset
        ? idx + 3
        : idx + Number(ctx.update.inline_query.offset) + 2,
      type: 'article',
      title: `You vs ${enemy.first_name}`,
      description: `Started ${createdAt.getDate()}.${createdAt.getMonth()}.${createdAt.getFullYear()} | ${moves.length} turns`,
      thumb_url: `http://chess.bushuev.wtf/${fen.replace(/\//g, '%2F')}.jpeg`,
      thumb_width: 418,
      thumb_height: 418,
      input_message_content: {
        parse_mode: 'Markdown',
        disable_web_page_preview: true,
        message_text: `Waiting for confirmation by [${enemy.first_name}](tg://user?id=${enemy.id})!
${topMessage(!isWhiteTurn(moves), user, enemy)}
${statusMessage(status)} | [Discussion](https://t.me/chessy_bot_chat)`,
      },
      ...board({
        board: status.board.squares,
        isWhite: isWhiteTurn(moves),
        callbackOverride: `rejoin::${game.id}::${user.id}`,
        actions: [{
          text: 'Join the game',
          callback_data: `rejoin::${game.id}::${user.id}`,
        }, {
          text: 'New game',
          switch_inline_query_current_chat: '',
        }],
      }),
    }
  }))

  const gameClient = chess.create({ PGN: true })
  let status = gameClient.getStatus()
  let results = []

  if (!ctx.update.inline_query.offset) {
    const fen = gameClient.getFen()

    results = [
      {
        id: 1,
        type: 'photo',
        photo_url: `http://chess.bushuev.wtf/${fen.replace(/\//g, '%2F')}.jpeg`,
        thumb_url: `http://chess.bushuev.wtf/${fen.replace(/\//g, '%2F')}.jpeg`,
        title: 'Play as white',
        parse_mode: 'Markdown',
        disable_web_page_preview: true,
        caption: `Black (top): ?
White (bottom): ${user.first_name}
Waiting for a black side | [Discussion](https://t.me/chessy_bot_chat)`,
        ...board({
          board: status.board.squares,
          isWhite: true,
          callbackOverride: `join::w::${user.id}`,
          actions: [{
            text: 'Join the game',
            callback_data: `join::w::${user.id}`,
          }, {
            text: 'New game',
            switch_inline_query_current_chat: '',
          }],
        }),
      },
      {
        id: 2,
        type: 'photo',
        photo_url: `http://chess.bushuev.wtf/${fen.replace(/\//g, '%2F')}.jpeg?rotate=1`,
        thumb_url: `http://chess.bushuev.wtf/${fen.replace(/\//g, '%2F')}.jpeg?rotate=1`,
        title: 'Play as black',
        parse_mode: 'Markdown',
        disable_web_page_preview: true,
        caption: `White (top): ?
Black (bottom): ${user.first_name}
Waiting for a white side | [Discussion](https://t.me/chessy_bot_chat)`,
        ...board({
          board: status.board.squares,
          isWhite: false,
          callbackOverride: `join::b::${user.id}`,
          actions: [{
            text: 'Join the game',
            callback_data: `join::b::${user.id}`,
          }, {
            text: 'New game',
            switch_inline_query_current_chat: '',
          }],
        }),
      },
      ...list,
    ]
  } else {
    results = list
  }

  await ctx.answerInlineQuery(results, {
    is_personal: true,
    cache_time: 0,
  }).catch(debug)
}
