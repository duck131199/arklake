import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { renderMultilineText } from '../src/invoice-description'

const multiline = renderToStaticMarkup(<>{renderMultilineText('QA production test\nSecond line memo')}</>)
assert.equal(multiline, 'QA production test<br/>Second line memo')

const escaped = renderToStaticMarkup(<>{renderMultilineText('Line <one>\n<script>alert(1)</script>')}</>)
assert.equal(escaped, 'Line &lt;one&gt;<br/>&lt;script&gt;alert(1)&lt;/script&gt;')

console.log('invoice description multiline regression passed')
