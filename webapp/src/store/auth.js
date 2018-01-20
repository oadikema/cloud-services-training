import base64 from "base-64"
import { combineEpics } from "redux-observable"
import { from as observableFrom } from "rxjs/observable/from"
import { of as observableOf } from "rxjs/observable/of"
import { race as raceObservables } from "rxjs/observable/race"
import { mergeMap } from "rxjs/operators/mergeMap"
import { map } from "rxjs/operators/map"
import { catchError } from "rxjs/operators/catchError"
import { filter } from "rxjs/operators/filter"

// Selectors

export const getAuthDialog = state => state.auth.dialog
export const getAuthToken = state => state.auth.token
export const getAuthTokenExpiration = state => state.auth.tokenExpiration

// Action Creators

export const openAuthDialog = () => ({ type: "OPEN_AUTH_DIALOG" })
export const closeAuthDialog = () => ({ type: "CLOSE_AUTH_DIALOG" })
export const changeAuthDialog = changes => ({
  type: "CHANGE_AUTH_DIALOG",
  ...changes
})
export const submitAuthDialog = () => ({ type: "SUBMIT_AUTH_DIALOG" })
export const authSubmitFailed = errorMessage => ({
  type: "AUTH_SUBMIT_FAILED",
  errorMessage
})
export const receiveAuthToken = (token, expiration) => ({
  type: "RECEIVE_AUTH_TOKEN",
  token,
  expiration
})
export const clearAuthToken = () => ({ type: "CLEAR_AUTH_TOKEN" })

// Reducers

export const authReducer = (
  state = {
    dialog: {
      isOpen: false,
      isSubmitting: false,
      email: "",
      password: "",
      errorMessage: ""
    },
    token: null,
    tokenExpiration: null
  },
  { type, ...payload }
) => {
  switch (type) {
    case "OPEN_AUTH_DIALOG":
      return {
        ...state,
        dialog: { ...state.dialog, isOpen: true }
      }
    case "CLOSE_AUTH_DIALOG":
      return {
        ...state,
        dialog: {
          ...state.dialog,
          isOpen: false,
          isSubmitting: false,
          email: "",
          password: "",
          errorMessage: ""
        }
      }
    case "CHANGE_AUTH_DIALOG":
      return {
        ...state,
        dialog: { ...state.dialog, ...payload }
      }
    case "SUBMIT_AUTH_DIALOG":
      return {
        ...state,
        dialog: { ...state.dialog, isSubmitting: true }
      }
    case "AUTH_SUBMIT_FAILED":
      return {
        ...state,
        dialog: {
          ...state.dialog,
          isSubmitting: false,
          errorMessage: payload.errorMessage
        }
      }
    case "RECEIVE_AUTH_TOKEN":
      return {
        ...state,
        dialog: {
          ...state.dialog,
          isOpen: false,
          isSubmitting: false,
          email: "",
          password: ""
        },
        token: payload.token,
        tokenExpiration: payload.expiration
      }
    case "CLEAR_AUTH_TOKEN":
      return {
        ...state,
        token: null,
        tokenExpiration: null
      }
    default:
      return state
  }
}

// Epics

export const encodeBasicAuth = (email, password) =>
  `Basic ${base64.encode(`${email}:${password}`)}`

export const authEpic = (actionsObservable, { getState }, { fetch }) =>
  actionsObservable.ofType("SUBMIT_AUTH_DIALOG").pipe(
    mergeMap(() =>
      raceObservables(
        actionsObservable.ofType("CLOSE_AUTH_DIALOG"),
        observableFrom(
          fetch("/api/auth/token", {
            headers: {
              Authorization: encodeBasicAuth(
                getAuthDialog(getState()).email,
                getAuthDialog(getState()).password
              )
            }
          })
        )
      ).pipe(
        filter(value => value.type !== "CLOSE_AUTH_DIALOG"),
        mergeMap(response => {
          if (response.ok) return observableFrom(response.json())
          else
            throw new Error(
              `HTTP Error: ${response.statusText} (${response.status})`
            )
        }),
        map(body => receiveAuthToken(body.token, body.tokenExpiration)),
        catchError(error => observableOf(authSubmitFailed(error.message)))
      )
    )
  )
