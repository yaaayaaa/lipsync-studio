import type { Impl } from './contract'
import { impl as current } from './impl/current'
import { impl as radix } from './impl/radix'
import { impl as ariakit } from './impl/ariakit'
import { impl as floating } from './impl/floating'
import { impl as reactaria } from './impl/reactaria'
import { impl as baseui } from './impl/baseui'
import { impl as headless } from './impl/headless'

export const IMPLS: Impl[] = [current, radix, ariakit, floating, reactaria, baseui, headless]
