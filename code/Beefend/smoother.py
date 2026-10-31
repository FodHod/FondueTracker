from collections import deque
import random

#id only present if apriltag is detected
example = {"time": 1793443169.0806723,
           "temperature": 27,
           "tags":[
                {"id": 2, "in_pot": True},
                {"id": 1, "in_pot": True}]}

def make_example(t):
    return {
        "time": t,
        "temperature": random.randint(0, 90),
        "tags": [{"id": i, "in_pot": random.choice([True, False])} for i in range(1, 3)],
    }

examples = [make_example(1793443169.08 + 10 * k) for k in range(10)]

history = deque(maxlen=2)


for example in examples:
    in_pot={}
    print("--")
    history.append(example["tags"])
    for output in history:
        for fork in output:
            if fork["id"] not in in_pot:
                in_pot[fork["id"]] = fork["in_pot"]
            elif fork["in_pot"]:
                in_pot[fork["id"]] = True


            print(fork)
    print(in_pot)