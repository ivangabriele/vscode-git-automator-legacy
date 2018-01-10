import * as vscode from 'vscode'

import cancelAdd from './cancelAdd'
import changeDirectory from '../helpers/changeDirectory'
import getGitStatusFiles from '../helpers/getGitStatusFiles'
import gitAdd from '../helpers/gitAdd'
import gitCommit from '../helpers/gitCommit'
import replaceStringWith from '../helpers/replaceStringWith'
import validateCommitMessage from '../helpers/validateCommitMessage'

import { GitStatusFile, Settings } from '../types';

export default async function addAndCommitFiles(filesRelativePaths: string[], settings: Settings): Promise<void> {
  const workspaceRootAbsolutePath = vscode.workspace.workspaceFolders[0].uri.fsPath

  // ----------------------------------
  // CHANGE DIRECTORY

  try {
    await changeDirectory(workspaceRootAbsolutePath)
  }
  catch (err) {
    vscode.window.showErrorMessage(err)
    console.error(err)

    return
  }

  // ----------------------------------
  // GIT ADD

  try {
    await gitAdd(filesRelativePaths)
  }
  catch (err) {
    // Git warnings are also caught here, so let's ignore them
    if (typeof err !== 'string' || err.substr(0, 7) !== 'warning') {
      vscode.window.showErrorMessage(err)
      console.error(err)

      return
    }
  }

  // ----------------------------------
  // COMMIT MESSAGE

  const gitStatusFiles = await getGitStatusFiles()

  let commitMessage = ''
  const firstGitStatusFile = gitStatusFiles[0]

  // Prefill the commit message with file path
  if (gitStatusFiles.length === 1 && settings.prefillCommitMessage.withFileWorkspacePath) {
    commitMessage += firstGitStatusFile.path + ': '

    if (settings.prefillCommitMessage.ignoreFileExtension) {
      const matches = commitMessage.match(/[^\/](\.\w+):/)
      if (matches !== null && matches.length === 2) {
        commitMessage = commitMessage.replace(matches[1], '')
      }
    }
  }

  // Prefill the commit message with the guessed action
  if (gitStatusFiles.length === 1 && settings.prefillCommitMessage.withGuessedAction) {
    switch (firstGitStatusFile.state) {
      case 'ADDED':
        commitMessage += 'create'
        break

      case 'DELETED':
        commitMessage += 'remove'
        break

      case 'RENAMED':
        commitMessage += 'move'
        break

      default:
        break
    }
  }

  commitMessage = replaceStringWith(commitMessage, settings.prefillCommitMessage.replacePatternWith)

  // Prompt user for the commit message
  try {
    commitMessage = await vscode.window.showInputBox({
      ignoreFocusOut: true,
      prompt: 'Git commit message ?',
      validateInput: commitMessage => !validateCommitMessage(commitMessage)
        ? `You can't commit with an empty commit message. Write something or press ESC to cancel.`
        : undefined,
      value: commitMessage
    })
  }
  catch (err) {
    vscode.window.showErrorMessage(err)
    console.error(err)

    return cancelAdd(filesRelativePaths)
  }

  // Check if the commit message is valid
  if (!validateCommitMessage(commitMessage)) {
    vscode.window.showWarningMessage(`You can't commit with an empty commit message.`)

    return cancelAdd(filesRelativePaths)
  }

  // ----------------------------------
  // GIT COMMIT

  try {
    await gitCommit(commitMessage)
  }
  catch (err) {
    // Git warnings are also caught here, so let's ignore them
    if (typeof err !== 'string' || err.substr(0, 7) !== 'warning') {
      vscode.window.showErrorMessage(err)
      console.error(err)

      return cancelAdd(filesRelativePaths)
    }
  }

  // ----------------------------------
  // END

  vscode.window.showInformationMessage(`File(s) committed to Git with the message: "${commitMessage}".`)
}
