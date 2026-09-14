import React, { Fragment } from 'react'

export function renderMultilineText(value: string) {
  return value.split('\n').map((line, index) => (
    <Fragment key={index}>
      {index > 0 ? <br /> : null}
      {line}
    </Fragment>
  ))
}
