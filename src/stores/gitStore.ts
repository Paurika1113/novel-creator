import { create } from 'zustand'
import type { GitBranch, GitCommit, GitDiff } from '../types'

interface GitStore {
  branches: Record<string, GitBranch[]>
  commits: Record<string, GitCommit[]>
  currentDiff: GitDiff | null

  // 分支操作
  setBranches: (bookId: string, branches: GitBranch[]) => void
  switchBranch: (bookId: string, branchName: string) => void
  createBranch: (bookId: string, name: string) => void

  // 提交历史
  setCommits: (bookId: string, commits: GitCommit[]) => void
  addCommit: (bookId: string, commit: GitCommit) => void

  // Diff
  setDiff: (diff: GitDiff | null) => void
}

export const useGitStore = create<GitStore>((set) => ({
  branches: {},
  commits: {},
  currentDiff: null,

  setBranches: (bookId, branches) => {
    set((state) => ({
      branches: { ...state.branches, [bookId]: branches },
    }))
  },

  switchBranch: (bookId, branchName) => {
    set((state) => {
      const existing = state.branches[bookId] || []
      return {
        branches: {
          ...state.branches,
          [bookId]: existing.map((b) => ({
            ...b,
            isCurrent: b.name === branchName,
          })),
        },
      }
    })
  },

  createBranch: (bookId, name) => {
    set((state) => {
      const existing = state.branches[bookId] || []
      const newBranch: GitBranch = {
        name,
        isCurrent: false,
        commitCount: 0,
        lastCommitDate: new Date().toISOString(),
      }
      return {
        branches: {
          ...state.branches,
          [bookId]: [...existing, newBranch],
        },
      }
    })
  },

  setCommits: (bookId, commits) => {
    set((state) => ({
      commits: { ...state.commits, [bookId]: commits },
    }))
  },

  addCommit: (bookId, commit) => {
    set((state) => {
      const existing = state.commits[bookId] || []
      return {
        commits: {
          ...state.commits,
          [bookId]: [commit, ...existing],
        },
      }
    })
  },

  setDiff: (diff) => set({ currentDiff: diff }),
}))
