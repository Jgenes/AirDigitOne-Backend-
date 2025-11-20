
const express = require('express')
const app = express()
const port = 3000

app.get('/', (req, res)=>{
    res.send('AirDigOne')
})

app.listen(port, () => {
    console.log(`AirDigOne server started on port ${port}`)
})
