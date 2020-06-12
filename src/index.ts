import * as http from 'http'
import app from './filesystem-parse-server'
import { PORT } from './var/config'

const server: http.Server = new http.Server(app())

server.listen(process.env.PORT || PORT)

server.on('error', (e: Error) => {
  console.log('Error starting server' + e)
})

server.on('listening', () => {
    console.log(
        `Server started on port ${PORT} on env ${process.env.NODE_ENV || 'dev'}`,
    )
})

export default {
  server,
}
