'use strict'

require('dotenv').config() // load .env
const fetch = require('node-fetch')
const Queue = require('promise-queue')
const { oneLine } = require('common-tags')
const {
  flatMap,
  map,
} = require('lodash/fp')

const makeRequest = ({ origin, destination, startDate, endDate }) =>
  JSON.stringify({
    request: {
      slice: [
        {
          origin: origin,
          destination: destination,
          date: startDate,
        },
        {
          origin: destination,
          destination: origin,
          date: endDate,
        }
      ],
      passengers: {
        adultCount: 1,
        infantInLapCount: 0,
        infantInSeatCount: 0,
        childCount: 0,
        seniorCount: 0
      },
      solutions: 1,
      refundable: false
    }
  })

const getItinerary = segments => {
  const pairs = segments.map(({leg}) => {
    if (leg.length > 1) {
      console.log('More than one leg')
      console.log(JSON.stringify(leg, null, 2))
    }
    const {origin,destination} = leg[0]
    return [origin, destination]
  })
  return pairs.reduce((acc, pair) => ([
    ...acc,
    pair,
  ]), [])
}

const parseCost = x => Number(x.substr(3))

const queue = new Queue(1)

const requestQueued = (...args) =>
  queue.add(request.bind(undefined, ...args))

const request = async ({ origin, destination, startDate, endDate }) => {
  console.log({startDate, endDate})
  const key = process.env.API_KEY
  const fields = 'trips(tripOption/saleTotal,tripOption/slice,tripOption/pricing)'
  const url = `https://www.googleapis.com/qpxExpress/v1/trips/search?key=${key}&fields=${fields}`
  const options = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: makeRequest({ origin, destination, startDate, endDate }),
  }
  const raw = await fetch(url, options)
  const json = await raw.json()
  if (json.error) {
    console.log(JSON.stringify(json.error, null, 2))
    console.log(json)
  }
  const {saleTotal, slice} = json.trips.tripOption[0]
  const cost = parseCost(saleTotal)
  const toFlight = {
    date: startDate,
    from: origin,
    to: destination,
    duration: `${Math.round(slice[0].duration/60)}h`,
    itinerary: getItinerary(slice[0].segment)
  }

  const returnFlight = {
    date: endDate,
    from: destination,
    to: origin,
    duration: `${Math.round(slice[1].duration/60)}h`,
    itinerary: getItinerary(slice[1].segment)
  }
  return {
    cost,
    toFlight,
    returnFlight,
  }
}

const startDates = [
  '2017-11-3', 
  '2017-11-4', 
  '2017-11-5', 
  '2017-11-6', 
  '2017-11-7', 
  '2017-11-8', 
]
const origin = 'GRU'
const destination = 'VRN'
const endDates = [
  '2018-01-28',
  '2018-01-29',
  '2018-01-30',
  '2018-01-31',
]

;(async () => {
  const options = await Promise.all(
    flatMap(startDate =>
      map(endDate =>
        requestQueued({ origin, destination, startDate, endDate })
      )(endDates)
    )(startDates)
  )
  const cheapest = options.reduce(
    (acc, next) =>
      next.cost < acc.cost
      ? next
      : acc
    , {cost: Infinity}
  )
  console.log(JSON.stringify(cheapest, undefined, 2))
})().catch(console.error)

