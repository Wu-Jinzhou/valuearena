"""import sqlite3

with sqlite3.Connection("data.db") as conn:
    cursor = conn.cursor()
    cursor.execute("CREATE TABLE IF NOT EXISTS humanJudgements (scenarioIndex int, constitutionPath text, criterion text, model1 text, model2 text, win1 int, tie int, win2 int, PRIMARY KEY (scenarioIndex, constitutionPath, criterion, model1, model2));")


"""

import sqlite3

with sqlite3.Connection("data.db") as conn:
    cursor = conn.cursor()
    cursor.execute("CREATE TABLE IF NOT EXISTS humanJudgements (user text, datasetPath text, scenarioIndex int, constitutionPath text, criterion text, model1 text, model2 text, win1 int, tie int, win2 int, PRIMARY KEY (user, datasetPath, scenarioIndex, constitutionPath, criterion, model1, model2));")


